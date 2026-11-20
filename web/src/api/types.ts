export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface TypeDto {
  id: string;
  name: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
}

export interface ExpenseDto {
  id: string;
  typeId: string;
  typeName: string;
  typeIcon: string;
  typeIdArchived?: boolean;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number; // kuruş
  note: string | null;
  spentAt: number;
  createdAt: number;
}

export interface HomeDto {
  todayTotal: number;
  monthTotal: number;
  today: ExpenseDto[];
  types: TypeDto[];
  recentTypeIds: string[];
}

export interface CategoryDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  types: Array<{
    id: string;
    name: string;
    icon: string;
    archived: boolean;
    sortOrder: number;
  }>;
}

export interface CatalogDto {
  categories: CategoryDto[];
}

export interface MonthAgg {
  ym: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
}
