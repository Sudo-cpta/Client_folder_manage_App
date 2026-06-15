import * as XLSX from 'xlsx';
import type { FolderTemplate, ImportedCustomer, ImportedTemplateRow, ExcelImportResult } from '../types/index.js';

export class ExcelService {
  parseExcelBuffer(buffer: Buffer): ExcelImportResult {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const customers = this.parseCustomerSheet(workbook);
    const template = this.parseTemplateSheet(workbook);

    return { customers, template };
  }

  private parseCustomerSheet(workbook: XLSX.WorkBook): ImportedCustomer[] {
    const sheetName = workbook.SheetNames.find(name =>
      name.includes('顧問先') || name.includes('マスタ') || name.includes('顧客')
    );

    if (!sheetName) {
      return [];
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });

    if (rows.length < 2) return [];

    const headerRow = rows[0] as string[];
    const codeIdx = this.findColumnIndex(headerRow, ['顧問先コード', 'コード', 'code']);
    const nameIdx = this.findColumnIndex(headerRow, ['顧問先名', '顧客名', 'name']);
    const categoryIdx = this.findColumnIndex(headerRow, ['区分', 'category']);

    if (codeIdx === -1 || nameIdx === -1) {
      return [];
    }

    const customers: ImportedCustomer[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as (string | number | undefined)[];
      const code = row[codeIdx];
      const name = row[nameIdx];
      const category = categoryIdx !== -1 ? row[categoryIdx] : '';

      if (code !== undefined && name !== undefined) {
        const codeStr = String(code).trim();
        const nameStr = String(name).trim();
        const categoryStr = String(category || '').trim();

        if (codeStr && nameStr) {
          customers.push({
            code: codeStr,
            name: nameStr,
            category: categoryStr,
            folderName: `${codeStr}_${nameStr}`,
          });
        }
      }
    }

    return customers;
  }

  private parseTemplateSheet(workbook: XLSX.WorkBook): FolderTemplate[] {
    const sheetName = workbook.SheetNames.find(name =>
      name.includes('テンプレート') || name.includes('フォルダ') || name.includes('template')
    );

    if (!sheetName) {
      return [];
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });

    if (rows.length < 2) return [];

    const headerRow = rows[0] as string[];
    const levelIdx = this.findColumnIndex(headerRow, ['階層', 'level', 'レベル']);
    const nameIdx = this.findColumnIndex(headerRow, ['フォルダ名', 'name', '名前']);
    const targetIdx = this.findColumnIndex(headerRow, ['対象区分', '対象', 'target', '区分']);

    if (levelIdx === -1 || nameIdx === -1) {
      return [];
    }

    const templateRows: ImportedTemplateRow[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as (string | number | undefined)[];
      const level = row[levelIdx];
      const name = row[nameIdx];
      const target = targetIdx !== -1 ? row[targetIdx] : '共通';

      if (level !== undefined && name !== undefined) {
        const levelNum = Number(level);
        const nameStr = this.cleanFolderName(String(name));
        const targetStr = String(target || '共通').trim();

        if (!isNaN(levelNum) && nameStr) {
          templateRows.push({
            level: levelNum,
            folderName: nameStr,
            description: '',
            targetType: this.parseTargetType(targetStr),
          });
        }
      }
    }

    return this.buildTemplateTree(templateRows);
  }

  private cleanFolderName(name: string): string {
    return name
      .replace(/^[├└│─┬┤┼\s\-|]+/, '')
      .replace(/^[\s\-]+/, '')
      .trim();
  }

  private parseTargetType(target: string): 'common' | 'corporate' | 'individual' {
    const lower = target.toLowerCase();
    if (lower.includes('法人') || lower === 'corporate') {
      return 'corporate';
    }
    if (lower.includes('個人') || lower === 'individual') {
      return 'individual';
    }
    return 'common';
  }

  private buildTemplateTree(rows: ImportedTemplateRow[]): FolderTemplate[] {
    const root: FolderTemplate[] = [];
    const stack: { level: number; folder: FolderTemplate }[] = [];

    for (const row of rows) {
      const folder: FolderTemplate = {
        id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: row.folderName,
        children: [],
        targetType: row.targetType,
      };

      if (row.level === 1) {
        root.push(folder);
        stack.length = 0;
        stack.push({ level: 1, folder });
      } else {
        while (stack.length > 0 && stack[stack.length - 1].level >= row.level) {
          stack.pop();
        }

        if (stack.length > 0) {
          stack[stack.length - 1].folder.children.push(folder);
        } else {
          root.push(folder);
        }

        stack.push({ level: row.level, folder });
      }
    }

    return root;
  }

  private findColumnIndex(headers: string[], possibleNames: string[]): number {
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i] || '').toLowerCase().trim();
      for (const name of possibleNames) {
        if (header.includes(name.toLowerCase())) {
          return i;
        }
      }
    }
    return -1;
  }

  filterTemplateByCategory(
    template: FolderTemplate[],
    category: string
  ): FolderTemplate[] {
    const isCorporate = category.includes('法人');
    const isIndividual = category.includes('個人');

    const filterFolder = (folder: FolderTemplate): FolderTemplate | null => {
      const targetType = folder.targetType || 'common';

      if (targetType === 'corporate' && !isCorporate) return null;
      if (targetType === 'individual' && !isIndividual) return null;

      const filteredChildren = folder.children
        .map(child => filterFolder(child))
        .filter((child): child is FolderTemplate => child !== null);

      return {
        ...folder,
        children: filteredChildren,
      };
    };

    return template
      .map(folder => filterFolder(folder))
      .filter((folder): folder is FolderTemplate => folder !== null);
  }
}
