import { NextResponse } from "next/server";

type ConnectBody = {
  marketplace?: "ozon" | "wb";
  clientId?: string;
  apiKey?: string;
  token?: string;
};

export async function POST(request: Request) {
  let body: ConnectBody;
  try {
    body = await request.json() as ConnectBody;
  } catch {
    return NextResponse.json({ connected: false, message: "Некорректный запрос" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    let response: Response;
    if (body.marketplace === "ozon") {
      if (!body.clientId?.trim() || !body.apiKey?.trim()) {
        return NextResponse.json({ connected: false, message: "Укажите Client-Id и Api-Key" }, { status: 400 });
      }
      response = await fetch("https://api-seller.ozon.ru/v1/description-category/tree", {
        method: "POST",
        headers: {
          "Client-Id": body.clientId.trim(),
          "Api-Key": body.apiKey.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ language: "DEFAULT" }),
        cache: "no-store",
        signal: controller.signal,
      });
    } else if (body.marketplace === "wb") {
      if (!body.token?.trim()) {
        return NextResponse.json({ connected: false, message: "Укажите токен Wildberries" }, { status: 400 });
      }
      response = await fetch("https://common-api.wildberries.ru/ping", {
        headers: { Authorization: body.token.trim() },
        cache: "no-store",
        signal: controller.signal,
      });
    } else {
      return NextResponse.json({ connected: false, message: "Неизвестная площадка" }, { status: 400 });
    }

    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? "Ключ отклонён площадкой. Проверьте права доступа."
        : `Площадка вернула ошибку ${response.status}`;
      return NextResponse.json({ connected: false, message }, { status: 400 });
    }

    return NextResponse.json({
      connected: true,
      message: "Соединение с API подтверждено",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Площадка не ответила за 12 секунд"
      : "Не удалось связаться с API площадки";
    return NextResponse.json({ connected: false, message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
