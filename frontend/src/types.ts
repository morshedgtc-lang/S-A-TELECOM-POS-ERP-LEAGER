export type Action =
  | 'sell'
  | 'giveDiscount'
  | 'editPrice'
  | 'managePurchases'
  | 'manageProducts'
  | 'manageParties'
  | 'manageMoney'
  | 'manageExpenses'
  | 'manageStaff'
  | 'viewCost'
  | 'viewProfit'
  | 'viewAudit';

export interface User {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'staff';
  permissions: Record<Action, boolean>;
}

export interface Category {
  id: number;
  name: string;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  categoryId: number | null;
  categoryName: string | null;
  salePrice: number;
  buyPrice?: number;
  stock: number;
  lowStockLimit: number;
  serialized: boolean;
  isLowStock: boolean;
}

export interface Party {
  id: number;
  name: string;
  mobile: string | null;
  address: string | null;
  balance: number;
  customerType?: 'retail' | 'wholesaler';
}

export interface Account {
  id: number;
  name: string;
  accountType: 'cash' | 'bank' | 'mobile_wallet';
  balance: number;
}

export interface Expense {
  id: number;
  category: string;
  amount: number;
  accountName: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SaleSummary {
  id: number;
  invoiceNo: string;
  customerName: string;
  total: number;
  paid: number;
  due: number;
  createdAt: string;
}

export interface PurchaseSummary {
  id: number;
  invoiceNo: string;
  supplierName: string;
  total: number;
  paid: number;
  due: number;
  createdAt: string;
}

export interface Dashboard {
  today: { salesTotal: number; salesCount: number; salesDue: number; expenses: number; grossProfit?: number };
  receivable: number;
  payable: number;
  accounts: Account[];
  lowStock: { id: number; name: string; stock: number; lowStockLimit: number }[];
}
