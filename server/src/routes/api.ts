import { Router, Request, Response } from 'express';
import multer from 'multer';
import { DriveService } from '../services/driveService.js';
import { ExcelService } from '../services/excelService.js';
import type { FolderTemplate, ApiResponse, ExcelImportResult } from '../types/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const excelService = new ExcelService();

// アクセストークンと親フォルダIDをヘッダーから取得するミドルウェア
function getDriveService(req: Request): DriveService {
  const accessToken = req.headers['x-access-token'] as string;
  const parentFolderId = req.headers['x-parent-folder-id'] as string;

  if (!accessToken || !parentFolderId) {
    throw new Error('Missing access token or parent folder ID');
  }

  return new DriveService(accessToken, parentFolderId);
}

// 顧客フォルダ一覧を取得
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const customers = await driveService.getCustomerFolders();
    res.json({ success: true, data: customers } as ApiResponse<typeof customers>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// 特定顧客のフォルダ構造を取得
router.get('/customers/:customerId/structure', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const structure = await driveService.getFolderStructure(req.params.customerId);
    res.json({ success: true, data: structure } as ApiResponse<typeof structure>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// テンプレート構造を全顧客に適用
router.post('/apply-template', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const template: FolderTemplate[] = req.body.template;

    if (!template || !Array.isArray(template)) {
      throw new Error('Invalid template format');
    }

    const results = await driveService.applyTemplateToAllCustomers(template);
    res.json({ success: true, data: results } as ApiResponse<typeof results>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// 新しい顧客フォルダを作成（テンプレート適用）
router.post('/customers', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const { customerName, template } = req.body;

    if (!customerName) {
      throw new Error('Customer name is required');
    }

    const result = await driveService.createCustomerWithTemplate(
      customerName,
      template || []
    );
    res.json({ success: true, data: result } as ApiResponse<typeof result>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// 全顧客のサブフォルダ名を一括変更
router.post('/rename-subfolder', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const { oldName, newName, parentPath } = req.body;

    if (!oldName || !newName) {
      throw new Error('Old name and new name are required');
    }

    const results = await driveService.renameSubfolderForAllCustomers(
      oldName,
      newName,
      parentPath || []
    );
    res.json({ success: true, data: results } as ApiResponse<typeof results>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// 特定フォルダが空かどうかチェック
router.get('/folders/:folderId/is-empty', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const isEmpty = await driveService.isFolderEmpty(req.params.folderId);
    res.json({ success: true, data: { isEmpty } } as ApiResponse<{ isEmpty: boolean }>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// Excelファイルをインポート
router.post('/import/excel', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw new Error('No file uploaded');
    }

    const result = excelService.parseExcelBuffer(req.file.buffer);
    res.json({ success: true, data: result } as ApiResponse<ExcelImportResult>);
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

// 顧客にフィルタリングされたテンプレートを適用して全顧客フォルダを作成
router.post('/create-all-customers', async (req: Request, res: Response) => {
  try {
    const driveService = getDriveService(req);
    const { customers, template } = req.body;

    if (!customers || !Array.isArray(customers)) {
      throw new Error('Invalid customers data');
    }
    if (!template || !Array.isArray(template)) {
      throw new Error('Invalid template data');
    }

    const results = [];

    for (const customer of customers) {
      try {
        const filteredTemplate = excelService.filterTemplateByCategory(
          template,
          customer.category || ''
        );

        const result = await driveService.createCustomerWithTemplate(
          customer.folderName,
          filteredTemplate
        );

        results.push({
          customerId: result.customerId,
          customerName: customer.folderName,
          status: 'success' as const,
          created: result.created,
          deleted: [],
        });
      } catch (error) {
        results.push({
          customerId: '',
          customerName: customer.folderName,
          status: 'error' as const,
          message: `${error}`,
          created: [],
          deleted: [],
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(400).json({ success: false, error: `${error}` } as ApiResponse<null>);
  }
});

export default router;
