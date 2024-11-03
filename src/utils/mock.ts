// Mock implementations of User and Council interfaces

export type newModule = 'articles' | 'faq' | 'contacts' | 'producten' | 'reports' | 'logboek' | 'users' | 'permits' | 'barcodereeksen' | 'apis' | 'abonnementen';

export type newUserRole = 'intern_admin' | 'extern_admin' | 'extern_redacteur' | 'exploitantbeheerder' | 'dataanalist' | 'beheerder' | 'user' | 'exploitant' | 'admin' | 'intern_editor' | 'root';

export type newUserRight = 'gemeente' | 'website' | 'locaties' | 'fietskluizen' | 'buurtstallingen' | 'abonnementen' | 'documenten' | 'fietsenwin' | 'diashow' | 'accounts' | 'rapportages' | 'externalApis' | 'permits' | 'sleutelhangerreeksen' | 'registranten' | 'users';

export interface User {
  displayName: string;
  role: newUserRole;
  hasRight: (right: newUserRight) => boolean;
  getRole: () => newUserRole;
}

export interface Council {
  hasModule: (moduleName: string) => boolean;
  hasSubscriptionType: () => boolean;
  getID: () => string;
  getCompanyName: () => string;
}
export interface Exploitant {
  getCompanyName: () => string;
}


export const mockUser: User = {
    displayName: 'John Doe',
    role: 'admin',
    hasRight: (right: string) => {
      // Implement your logic to check user rights
      const rights = ['permits', 'users', 'report'];
      return rights.includes(right);
    },
    getRole: () => 'admin',
  };
  
  export const mockCouncil: Council = {
    hasModule: (moduleName: string) => {
      // Implement your logic to check council modules
      const modules = ['fietskluizen', 'buurtstallingen', 'abonnementen'];
      return modules.includes(moduleName) || true;
    },
    hasSubscriptionType: () => true,
    getID: () => '1',
    getCompanyName: () => 'Example Council',
  };
  
  export const mockExploitant: Exploitant = {
    getCompanyName: () => 'Example Exploitant',
  };
  
  