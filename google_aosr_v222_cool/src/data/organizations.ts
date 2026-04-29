import type { SavedOrganization } from '@/types';

export const defaultOrganizations: SavedOrganization[] = [
  {
    id: 'test-org-1',
    name: 'ООО "Тестовая Организация"',
    info: 'ИНН: 1234567890, ОГРН: 1234567890123, СРО-С-000-0000000000, Юр. адрес: 123456, г. Москва, ул. Тестовая, д. 1, стр. 1',
    representatives: [
      {
        id: 'test-rep-1',
        role: 'Генеральный директор',
        fio: 'Иванов И.И.'
      },
      {
        id: 'test-rep-2',
        role: 'Главный инженер проекта',
        fio: 'Петров П.П.'
      }
    ]
  }
];
