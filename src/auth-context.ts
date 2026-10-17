import { createContext, useContext } from "react";
import type { User } from "../shared/types";

interface AuthContextValue {
  user: User;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
// Keep context identity independent of route/component hot updates.
export const AuthContext = createContext<AuthContextValue>(null!);
export const useAuth = () => useContext(AuthContext);
