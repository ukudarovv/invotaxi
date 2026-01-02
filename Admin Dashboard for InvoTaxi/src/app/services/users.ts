import api from './api';

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  phone: string;
  role: string;
  role_display: 'Admin' | 'Dispatcher' | 'Operator';
  is_active: boolean;
  is_staff: boolean;
  last_login: string | null;
  date_joined: string;
  groups: string[];
  initials: string;
  first_name?: string;
  last_name?: string;
  first_name?: string;
  last_name?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface GetUsersParams {
  page?: number;
  page_size?: number;
  role?: 'Admin' | 'Dispatcher' | 'Operator';
  status?: 'active' | 'blocked';
  search?: string;
}

export interface CreateUserData {
  username?: string;
  email: string;
  phone: string;
  password: string;
  role: 'Admin' | 'Dispatcher' | 'Operator';
  first_name?: string;
  last_name?: string;
}

export interface UpdateUserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  role?: 'Admin' | 'Dispatcher' | 'Operator';
}

export interface ActivityLog {
  id: number;
  action_type: string;
  action_type_display: string;
  description: string;
  ip_address: string | null;
  performed_by_username: string | null;
  created_at: string;
}

// Вспомогательная функция для построения query string
function buildQueryString(params: Record<string, any>): string {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, String(value));
    }
  });
  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
}

export const usersApi = {
  /**
   * Получение списка пользователей с пагинацией и фильтрацией
   */
  async getUsers(params: GetUsersParams = {}): Promise<PaginatedResponse<AdminUser>> {
    const queryString = buildQueryString(params);
    return await api.get<PaginatedResponse<AdminUser>>(`/admin/users/${queryString}`);
  },

  /**
   * Получение одного пользователя по ID
   */
  async getUser(id: number): Promise<AdminUser> {
    return await api.get<AdminUser>(`/admin/users/${id}/`);
  },

  /**
   * Создание нового пользователя
   */
  async createUser(data: CreateUserData): Promise<AdminUser> {
    return await api.post<AdminUser>('/admin/users/', data);
  },

  /**
   * Обновление пользователя
   */
  async updateUser(id: number, data: UpdateUserData): Promise<AdminUser> {
    return await api.patch<AdminUser>(`/admin/users/${id}/`, data);
  },

  /**
   * Удаление пользователя
   */
  async deleteUser(id: number): Promise<void> {
    await api.delete<void>(`/admin/users/${id}/`);
  },

  /**
   * Переключение статуса пользователя (блокировка/разблокировка)
   */
  async toggleStatus(id: number): Promise<AdminUser> {
    return await api.post<AdminUser>(`/admin/users/${id}/toggle-status/`, {});
  },

  /**
   * Сброс пароля пользователя
   */
  async resetPassword(id: number, password: string): Promise<{ message: string }> {
    return await api.post<{ message: string }>(`/admin/users/${id}/reset-password/`, {
      password,
    });
  },

  /**
   * Массовые операции над пользователями
   */
  async bulkAction(
    userIds: number[],
    action: 'block' | 'unblock' | 'delete'
  ): Promise<{ message: string }> {
    return await api.post<{ message: string }>('/admin/users/bulk-action/', {
      user_ids: userIds,
      action,
    });
  },

  /**
   * Получение истории активности пользователя
   */
  async getActivityLog(userId: number): Promise<ActivityLog[]> {
    return await api.get<ActivityLog[]>(`/admin/users/${userId}/activity-log/`);
  },
};

