import { google, drive_v3 } from 'googleapis';
import type { FolderTemplate, CustomerFolder, SyncResult, DeleteCheckResult } from '../types/index.js';

export class DriveService {
  private drive: drive_v3.Drive;
  private parentFolderId: string;

  constructor(accessToken: string, parentFolderId: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: 'v3', auth });
    this.parentFolderId = parentFolderId;
  }

  // 顧客フォルダ一覧を取得
  async getCustomerFolders(): Promise<CustomerFolder[]> {
    const response = await this.drive.files.list({
      q: `'${this.parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, webViewLink)',
      orderBy: 'name',
    });

    return (response.data.files || []).map(file => ({
      id: file.id!,
      name: file.name!,
      webViewLink: file.webViewLink || undefined,
    }));
  }

  // 特定フォルダ配下のサブフォルダ構造を取得
  async getFolderStructure(folderId: string): Promise<FolderTemplate> {
    const folder = await this.drive.files.get({
      fileId: folderId,
      fields: 'id, name',
    });

    const children = await this.getChildFolders(folderId);

    return {
      id: folder.data.id!,
      name: folder.data.name!,
      children,
    };
  }

  // 子フォルダを再帰的に取得
  private async getChildFolders(parentId: string): Promise<FolderTemplate[]> {
    const response = await this.drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      orderBy: 'name',
    });

    const folders: FolderTemplate[] = [];
    for (const file of response.data.files || []) {
      const children = await this.getChildFolders(file.id!);
      folders.push({
        id: file.id!,
        name: file.name!,
        children,
      });
    }

    return folders;
  }

  // 顧客フォルダ配下にテンプレート構造を適用
  async applyTemplateToCustomer(
    customerId: string,
    template: FolderTemplate[],
    existingStructure: FolderTemplate[]
  ): Promise<{ created: string[]; errors: string[] }> {
    const created: string[] = [];
    const errors: string[] = [];

    await this.syncFolderStructure(customerId, template, existingStructure, created, errors);

    return { created, errors };
  }

  // フォルダ構造を同期（再帰的）
  private async syncFolderStructure(
    parentId: string,
    template: FolderTemplate[],
    existing: FolderTemplate[],
    created: string[],
    errors: string[]
  ): Promise<void> {
    for (const templateFolder of template) {
      const existingFolder = existing.find(e => e.name === templateFolder.name);

      if (existingFolder) {
        // 既存フォルダがある場合、子フォルダを再帰的に同期
        await this.syncFolderStructure(
          existingFolder.id,
          templateFolder.children,
          existingFolder.children,
          created,
          errors
        );
      } else {
        // 新規フォルダを作成
        try {
          const newFolder = await this.createFolder(templateFolder.name, parentId);
          created.push(templateFolder.name);

          // 子フォルダも作成
          if (templateFolder.children.length > 0) {
            await this.syncFolderStructure(
              newFolder.id!,
              templateFolder.children,
              [],
              created,
              errors
            );
          }
        } catch (error) {
          errors.push(`Failed to create ${templateFolder.name}: ${error}`);
        }
      }
    }
  }

  // フォルダを作成
  async createFolder(name: string, parentId: string): Promise<drive_v3.Schema$File> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id, name',
    });

    return response.data;
  }

  // 新しい顧客フォルダを作成し、テンプレートを適用
  async createCustomerWithTemplate(
    customerName: string,
    template: FolderTemplate[]
  ): Promise<{ customerId: string; created: string[] }> {
    const customerFolder = await this.createFolder(customerName, this.parentFolderId);
    const created: string[] = [customerName];
    const errors: string[] = [];

    await this.syncFolderStructure(customerFolder.id!, template, [], created, errors);

    return { customerId: customerFolder.id!, created };
  }

  // フォルダが空かどうかをチェック
  async isFolderEmpty(folderId: string): Promise<boolean> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });

    return !response.data.files || response.data.files.length === 0;
  }

  // テンプレートから削除されたフォルダを特定し、空の場合のみ削除
  async removeDeletedFolders(
    customerId: string,
    template: FolderTemplate[],
    existingStructure: FolderTemplate[]
  ): Promise<{ deleted: string[]; skipped: string[] }> {
    const deleted: string[] = [];
    const skipped: string[] = [];

    await this.syncDeleteFolders(template, existingStructure, deleted, skipped);

    return { deleted, skipped };
  }

  // 削除同期（再帰的）
  private async syncDeleteFolders(
    template: FolderTemplate[],
    existing: FolderTemplate[],
    deleted: string[],
    skipped: string[]
  ): Promise<void> {
    for (const existingFolder of existing) {
      const templateFolder = template.find(t => t.name === existingFolder.name);

      if (!templateFolder) {
        // テンプレートに存在しない場合、削除を試みる
        const isEmpty = await this.isFolderEmpty(existingFolder.id);
        if (isEmpty) {
          await this.deleteFolder(existingFolder.id);
          deleted.push(existingFolder.name);
        } else {
          skipped.push(`${existingFolder.name} (not empty)`);
        }
      } else {
        // 子フォルダを再帰的にチェック
        await this.syncDeleteFolders(
          templateFolder.children,
          existingFolder.children,
          deleted,
          skipped
        );
      }
    }
  }

  // フォルダを削除
  async deleteFolder(folderId: string): Promise<void> {
    await this.drive.files.delete({ fileId: folderId });
  }

  // 全顧客にテンプレートを適用
  async applyTemplateToAllCustomers(template: FolderTemplate[]): Promise<SyncResult[]> {
    const customers = await this.getCustomerFolders();
    const results: SyncResult[] = [];

    for (const customer of customers) {
      try {
        const existingStructure = await this.getFolderStructure(customer.id);

        // 新規フォルダを作成
        const { created, errors } = await this.applyTemplateToCustomer(
          customer.id,
          template,
          existingStructure.children
        );

        // 不要なフォルダを削除（空の場合のみ）
        const { deleted, skipped } = await this.removeDeletedFolders(
          customer.id,
          template,
          existingStructure.children
        );

        results.push({
          customerId: customer.id,
          customerName: customer.name,
          status: errors.length > 0 ? 'error' : 'success',
          message: errors.length > 0 ? errors.join(', ') :
                   skipped.length > 0 ? `Skipped: ${skipped.join(', ')}` : undefined,
          created,
          deleted,
        });
      } catch (error) {
        results.push({
          customerId: customer.id,
          customerName: customer.name,
          status: 'error',
          message: `${error}`,
          created: [],
          deleted: [],
        });
      }
    }

    return results;
  }

  // フォルダ名を変更
  async renameFolder(folderId: string, newName: string): Promise<void> {
    await this.drive.files.update({
      fileId: folderId,
      requestBody: { name: newName },
    });
  }

  // 全顧客の特定フォルダ名を一括変更
  async renameSubfolderForAllCustomers(
    oldName: string,
    newName: string,
    parentPath: string[] = []
  ): Promise<SyncResult[]> {
    const customers = await this.getCustomerFolders();
    const results: SyncResult[] = [];

    for (const customer of customers) {
      try {
        const targetFolder = await this.findFolderByPath(customer.id, [...parentPath, oldName]);

        if (targetFolder) {
          await this.renameFolder(targetFolder.id, newName);
          results.push({
            customerId: customer.id,
            customerName: customer.name,
            status: 'success',
            created: [],
            deleted: [],
          });
        } else {
          results.push({
            customerId: customer.id,
            customerName: customer.name,
            status: 'skipped',
            message: 'Folder not found',
            created: [],
            deleted: [],
          });
        }
      } catch (error) {
        results.push({
          customerId: customer.id,
          customerName: customer.name,
          status: 'error',
          message: `${error}`,
          created: [],
          deleted: [],
        });
      }
    }

    return results;
  }

  // パスでフォルダを検索
  private async findFolderByPath(
    parentId: string,
    path: string[]
  ): Promise<FolderTemplate | null> {
    if (path.length === 0) return null;

    const [current, ...rest] = path;

    const response = await this.drive.files.list({
      q: `'${parentId}' in parents and name = '${current}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });

    const folder = response.data.files?.[0];
    if (!folder) return null;

    if (rest.length === 0) {
      return { id: folder.id!, name: folder.name!, children: [] };
    }

    return this.findFolderByPath(folder.id!, rest);
  }
}
