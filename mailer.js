'use strict';

// E-mail de confirmação de aposta (via Amazon SES / SESv2).
// buildConfirmationEmail é puro (testável); sendConfirmationEmail faz o envio.

const { SendEmailCommand } = require('@aws-sdk/client-sesv2');

const NOMES = { 'mega-sena': 'Mega-Sena', lotofacil: 'Lotofácil', lotomania: 'Lotomania' };
const pad = (n) => String(n).padStart(2, '0');

function buildConfirmationEmail({ lottery, lotteryNumber, voucher, games, site = 'https://loteriassim.com.br' }) {
  const nome = NOMES[lottery] || lottery;
  const subject = `Confirmação da sua aposta • ${nome} concurso ${lotteryNumber}`;

  const jogosHtml = games.map((g, i) => {
    const balls = g.map((n) =>
      `<span style="display:inline-block;min-width:34px;text-align:center;margin:3px;padding:8px 0;` +
      `border-radius:50%;background:#1c1f26;color:#f8f9fa;font-weight:700;">${pad(n)}</span>`).join('');
    return `<div style="margin:6px 0;"><span style="color:#a0a5b1;margin-right:8px;">Jogo ${i + 1}</span>${balls}</div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0a0c10;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;color:#f8f9fa;">
    <h1 style="font-size:22px;margin:0 0 4px;">Loterias <span style="color:#00e5ff;">Sim</span></h1>
    <p style="color:#a0a5b1;margin:0 0 20px;">Aposta registrada • ${nome} — Concurso ${lotteryNumber}</p>
    <div style="background:#14161b;border-radius:10px;padding:16px;">${jogosHtml}</div>
    <p style="margin-top:16px;">✅ Sua aposta foi registrada. Você receberá o <strong>resultado por e-mail</strong> após o sorteio.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">Voucher: ${voucher}</p>
    <p style="color:#6b7280;font-size:12px;">${site} — Jogue com responsabilidade. As análises são informativas e não aumentam suas chances reais.</p>
  </div></body></html>`;

  const text =
    `${nome} - Concurso ${lotteryNumber}\nAposta registrada. Voce recebera o resultado por e-mail apos o sorteio.\n\n` +
    games.map((g, i) => `  Jogo ${i + 1}: ${g.map(pad).join(' ')}`).join('\n') +
    `\n\nVoucher: ${voucher}\n${site}`;

  return { subject, html, text };
}

async function sendConfirmationEmail(sesClient, sender, to, data) {
  if (!to) return false;
  const msg = buildConfirmationEmail(data);
  await sesClient.send(new SendEmailCommand({
    FromEmailAddress: sender,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: msg.html, Charset: 'UTF-8' },
          Text: { Data: msg.text, Charset: 'UTF-8' },
        },
      },
    },
  }));
  return true;
}

module.exports = { buildConfirmationEmail, sendConfirmationEmail };
