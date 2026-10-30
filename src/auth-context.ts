import { createContext, useContext } from "react";
import type { User } from "../shared/types";

interface AuthContextValue {
  user: User;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  switchCompany?: (companyId: string, destination?: string) => Promise<void>;
  companyError?: string;
}
// Keep context identity independent of route/component hot updates.
export const AuthContext = createContext<AuthContextValue>(null!);
export const useAuth = () => useContext(AuthContext);
