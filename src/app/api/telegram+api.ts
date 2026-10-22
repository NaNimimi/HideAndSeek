// Вебхук бота @PryatkiRobot: отвечает на /start описанием и кнопкой «Играть».
// Токен и секрет лежат в .env.local (не в git) и уходят на сервер при `eas deploy`.

const APP_URL = 'https://pryatki.expo.app';

const WELCOME = [
  '🙈 <b>Прятки</b> — настоящие прятки на карте города',
  '',
  '👑 Хост создаёт игру и выбирает зону на карте',
  '🎯 Охотник видит красные точки — где прятавшиеся были пару минут назад',
  '⭕ Зона сужается — вышел за неё, выбываешь',
  '🏁 Не нашли до конца — прятавшиеся победили',
  '',
  'Жми «Играть», создавай комнату и кидай друзьям код 👇',
].join('\n');

type Update = { message?: { chat: { id: number }; text?: string } };

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const update = (await request.json()) as Update;
  const msg = update.message;
  if (msg?.text) {
    // Приглашение по ссылке t.me/PryatkiRobot?start=КОД — сразу открываем комнату.
    const code = msg.text.match(/^\/start\s+([A-Z0-9]{5})$/i)?.[1]?.toUpperCase();
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.chat.id,
        text: code ? `Тебя зовут в комнату <b>${code}</b> 🙈` : WELCOME,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: code ? `${APP_URL}/?code=${code}` : APP_URL } }]],
        },
      }),
    });
  }
  return Response.json({ ok: true });
}
