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
  | 'viewAudit'
  | 'manageRepairs'
  | 'manageReturns'
  | 'viewReports'
  | 'manageSettings';

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

export type RepairStatus = 'in_work' | 'out_work' | 'success' | 'failed' | 'delivered';

export interface StatusBucket {
  count: number;
  estimated: number;
  advance: number;
}

export interface Dashboard {
  today: { salesTotal: number; salesCount: number; salesDue: number; expenses: number; grossProfit?: number };
  receivable: number;
  payable: number;
  accounts: Account[];
  lowStock: { id: number; name: string; stock: number; lowStockLimit: number }[];
  repairs: {
    byStatus: Record<'in_work' | 'out_work' | 'success' | 'failed', StatusBucket>;
    holdTotal: number;
    advanceHeld: number;
    deliveredToday: { count: number; total: number };
    technicians: number;
    technicianPayable: number;
  };
}

export interface RepairJob {
  id: number;
  jobNo: string;
  customerId: number;
  customerName: string;
  customerMobile: string | null;
  device: string;
  imei: string | null;
  problem: string;
  accessories: string | null;
  estimatedCost: number;
  advance: number;
  status: RepairStatus;
  outcome: 'success' | 'failed' | null;
  technicianId: number | null;
  technicianName: string | null;
  technicianCost?: number;
  technicianNote: string | null;
  promisedAt: string | null;
  serviceCharge: number;
  partsTotal: number;
  total: number;
  deliveryPaid: number;
  due: number;
  refunded: number;
  note: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface RepairDetail extends RepairJob {
  parts: { id: number; productId: number; productName: string; qty: number; unitPrice: number; lineTotal: number; restocked: boolean }[];
  events: { fromStatus: string | null; toStatus: string; note: string | null; userName: string | null; createdAt: string }[];
}

export interface Technician {
  id: number;
  name: string;
  mobile: string | null;
  shopName: string | null;
  specialties: string | null;
  balance: number;
  active: boolean;
  openJobs: number;
}

export interface TechLedgerRow {
  id: number;
  kind: 'opening' | 'job' | 'payment' | 'adjustment';
  amount: number;
  jobNo: string | null;
  note: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: number;
  productId: number;
  productName: string;
  qty: number;
  returnedQty: number;
  unitPrice: number;
  lineTotal: number;
  serials: string[];
  returnableSerials: string[];
}

export interface SaleDetail {
  id: number;
  invoiceNo: string;
  customerId: number | null;
  customerName: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
  items: SaleItem[];
  returns: { id: number; returnNo: string; total: number; credited: number; refunded: number; createdAt: string }[];
}

export interface ShopSettings {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  invoiceFooter: string;
  repairTerms: string;
}

export interface ReportSummary {
  from: string;
  to: string;
  sales: { count: number; total: number; discount: number; due: number; cost: number; profit: number };
  returns: { count: number; total: number; profitLost: number };
  repairs: { delivered: number; revenue: number; partsCost: number; technicianCost: number; profit: number };
  expenses: { total: number; byCategory: { category: string; total: number }[] };
  netProfit: number;
  cashbook: {
    accounts: { id: number; name: string; cashIn: number; cashOut: number; balance: number }[];
    byType: { refType: string; direction: 'in' | 'out'; total: number }[];
  };
}

export interface ImeiResult {
  units: {
    serial: string;
    status: 'in_stock' | 'sold';
    productName: string;
    purchaseNo: string | null;
    purchasedAt: string | null;
    supplierName: string | null;
    saleId: number | null;
    saleNo: string | null;
    soldAt: string | null;
    customerName: string | null;
  }[];
  repairs: { id: number; jobNo: string; device: string; imei: string; status: RepairStatus; customerName: string; customerMobile: string | null; createdAt: string }[];
}

export interface StaffUser {
  id: string;
  name: string;
  mobile: string | null;
  role: 'owner' | 'manager' | 'staff';
  active: boolean;
  basicSalary: number;
  lastLoginAt: string | null;
}
