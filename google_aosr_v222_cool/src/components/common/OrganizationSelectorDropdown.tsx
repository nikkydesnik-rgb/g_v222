import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Building2, ChevronDown, User } from 'lucide-react';
import type { SavedOrganization, Representative } from '@/types';

interface OrganizationSelectorDropdownProps {
  label: string; // e.g. "Застройщик"
  orgNameKey: string;
  orgInfoKey: string;
  repRoleKey: string;
  repFioKey: string;
}

export function OrganizationSelectorDropdown({ label, orgNameKey, orgInfoKey, repRoleKey, repFioKey }: OrganizationSelectorDropdownProps) {
  const { savedOrganizations, setPermanentData } = useStore();
  const [selectedOrg, setSelectedOrg] = useState<SavedOrganization | null>(null);

  const handleSelectOrg = (org: SavedOrganization) => {
    setSelectedOrg(org);
    setPermanentData(orgNameKey, org.name);
    setPermanentData(orgInfoKey, org.info);
    
    // Auto-select first representative if available and no one is selected yet
    if (org.representatives && org.representatives.length > 0) {
      const rep = org.representatives[0];
      setPermanentData(repRoleKey, rep.role);
      setPermanentData(repFioKey, rep.fio);
    }
  };

  const handleSelectRep = (rep: Representative) => {
    setPermanentData(repRoleKey, rep.role);
    setPermanentData(repFioKey, rep.fio);
  };

  if (savedOrganizations.length === 0) return null;

  return (
    <div className="flex gap-2 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 hover:text-purple-800 border-purple-200">
            <Building2 className="w-3 h-3 mr-1" />
            Выбрать из базы
            <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Организации ({label})</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {savedOrganizations.map((org) => (
            <DropdownMenuItem key={org.id} onClick={() => handleSelectOrg(org)} className="flex flex-col items-start gap-1 cursor-pointer">
              <span className="font-medium text-sm">{org.name}</span>
              {org.info && <span className="text-xs text-gray-500 line-clamp-1">{org.info}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedOrg && selectedOrg.representatives?.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border-blue-200">
              <User className="w-3 h-3 mr-1" />
              Представитель
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Представители от {selectedOrg.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {selectedOrg.representatives.map((rep) => (
              <DropdownMenuItem key={rep.id} onClick={() => handleSelectRep(rep)} className="flex flex-col items-start gap-1 cursor-pointer">
                <span className="font-medium text-sm">{rep.fio}</span>
                <span className="text-xs text-gray-500">{rep.role}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
