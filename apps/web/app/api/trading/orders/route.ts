import { NextResponse } from "next/server";
import { getTradingOrders, placeTradingOrder } from "@/lib/trading/service";
import type { TradeOrderRequest } from "@/lib/meeting/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getTradingOrders());
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<TradeOrderRequest>;

    if (!body.symbol || !body.side || !body.orderType || !body.quantity) {
      return NextResponse.json(
        { error: "symbol, side, orderType, and quantity are required" },
        { status: 400 }
      );
    }

    if (body.quantity <= 0) {
      return NextResponse.json({ error: "quantity must be positive" }, { status: 400 });
    }

    if (body.orderType === "limit" && (!body.limitPrice || body.limitPrice <= 0)) {
      return NextResponse.json({ error: "limitPrice must be positive for limit orders" }, { status: 400 });
    }

    return NextResponse.json(
      await placeTradingOrder({
        symbol: body.symbol.toUpperCase(),
        name: body.name,
        side: body.side,
        orderType: body.orderType,
        quantity: body.quantity,
        limitPrice: body.limitPrice
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
