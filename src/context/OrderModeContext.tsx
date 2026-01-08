"use client";

import { createContext, useContext, useState } from "react";

type OrderMode = "delivery" | "pickup";
type Ctx = { mode: OrderMode; setMode: (m: OrderMode) => void };

const OrderModeContext = createContext<Ctx | null>(null);

export function OrderModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<OrderMode>("delivery");
  return <OrderModeContext.Provider value={{ mode, setMode }}>{children}</OrderModeContext.Provider>;
}

export function useOrderMode() {
  const ctx = useContext(OrderModeContext);
  if (!ctx) throw new Error("useOrderMode must be used inside OrderModeProvider");
  return ctx;
}