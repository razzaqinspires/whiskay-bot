import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';
import { randomBytes } from 'node:crypto';

/**
 * Build binary nodes for native flow interactive message.
 * Replicates Baileys WhatsApp Web native_flow envelope.
 */
function buildNativeFlowNodes(buttonCount, isGroup, flowName = 'mixed') {
  const randomHex = randomBytes(20).toString('hex');
  const nodes = [{
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: String(Math.floor(Date.now() / 1000))
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: flowName } }]
      },
      {
        tag: 'quality_control',
        attrs: { decision_id: randomHex, source_type: 'third_party' },
        content: [{ tag: 'decision_source', attrs: { value: 'df' } }]
      }
    ]
  }];
  if (!isGroup) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
  return nodes;
}

/**
 * Normalize mixed buttons + sections into native flow buttons array.
 */
function buildNativeButtons(buttons = [], sections = null, listTitle = 'Pilih') {
  const list = [...buttons];

  // If sections provided and no single_select exists, prepend one
  if (Array.isArray(sections) && sections.length) {
    const hasSelect = list.some(b =>
      b.name === 'single_select' || b.type === 'single_select' ||
      b.name === 'list' || b.type === 'list'
    );
    if (!hasSelect) {
      list.unshift({
        name: 'single_select',
        title: listTitle,
        sections
      });
    }
  }

  return list.map((b, idx) => {
    let name = b.type || b.name || 'quick_reply';
    let params = {};

    // Parse existing buttonParamsJson if present
    let existing = {};
    if (b.buttonParamsJson) {
      try {
        existing = typeof b.buttonParamsJson === 'string'
          ? JSON.parse(b.buttonParamsJson)
          : b.buttonParamsJson;
      } catch {}
    }

    if (name === 'single_select' || name === 'list') {
      name = 'single_select';
      params = {
        title: b.title || existing.title || listTitle || 'Pilih',
        sections: b.sections || existing.sections || []
      };
    } else if (name === 'cta_url' || name === 'url' || name === 'open_webview') {
      name = 'cta_url';
      const url = b.url || existing.url || 'https://google.com';
      params = {
        display_text: b.title || b.display_text || existing.display_text || 'Open',
        url,
        merchant_url: url,
        webview_interaction: true
      };
    } else if (name === 'cta_call' || name === 'call') {
      name = 'cta_call';
      const raw = b.phone || b.phone_number || existing.phone || '6281234567890';
      const clean = String(raw).replace(/[^0-9+]/g, '');
      params = {
        display_text: b.title || b.display_text || existing.display_text || 'Call',
        phone: clean,
        phone_number: clean
      };
    } else if (name === 'cta_copy' || name === 'copy') {
      name = 'cta_copy';
      const code = b.copy_code || b.id || existing.copy_code || existing.id || 'COPY';
      params = {
        display_text: b.title || b.display_text || existing.display_text || 'Copy',
        id: code,
        copy_code: code
      };
    } else {
      name = 'quick_reply';
      params = {
        display_text: b.title || b.display_text || existing.display_text || 'Action',
        id: String(b.id || existing.id || `btn_${idx}`)
      };
    }

    return { name, buttonParamsJson: JSON.stringify(params) };
  });
}

/**
 * Send an interactive native flow message.
 * Matches the working sendRpgScreen pattern.
 *
 * @param {object} sock  - Baileys socket
 * @param {string} jid   - target JID
 * @param {object} opts  - { title, subtitle, body, footer, image, buttons, sections, listTitle }
 * @param {object} quoted - original message to quote
 */
export async function sendInteractiveMessage(sock, jid, opts = {}, quoted = null) {
  const {
    title = '',
    subtitle = '',
    body = '',
    footer = '',
    image = null,
    media = null,
    buttons = [],
    sections = null,
    listTitle = 'Pilih Aksi'
  } = opts;

  const nativeButtons = buildNativeButtons(buttons, sections, listTitle);

  // Compose fallback text (used if relayMessage fails)
  const fallbackLines = [];
  if (title) fallbackLines.push(`*${title}*`);
  if (subtitle) fallbackLines.push(`_${subtitle}_`);
  if (title || subtitle) fallbackLines.push('');
  if (body) fallbackLines.push(body);
  if (Array.isArray(sections)) {
    for (const s of sections) {
      fallbackLines.push('');
      fallbackLines.push(`*─── ${s.title || 'Options'} ───*`);
      for (const r of (s.rows || [])) {
        fallbackLines.push(`• *${r.title}* → ${r.id}`);
      }
    }
  }
  for (const b of nativeButtons) {
    if (b.name !== 'single_select') {
      try {
        const p = JSON.parse(b.buttonParamsJson);
        fallbackLines.push(`• *${p.display_text}* → ${p.id}`);
      } catch {}
    }
  }
  if (footer) fallbackLines.push('', `_${footer}_`);

  // Build interactive payload
  let mediaPayload = null;
  const mediaSource = image || media;
  if (mediaSource && typeof sock?.waUploadToServer === 'function') {
    try {
      const { prepareWAMessageMedia } = await import('@whiskeysockets/baileys');
      const formatted = Buffer.isBuffer(mediaSource) || mediaSource instanceof Uint8Array
        ? Buffer.from(mediaSource)
        : typeof mediaSource === 'string' ? { url: mediaSource } : mediaSource;
      mediaPayload = await prepareWAMessageMedia({ image: formatted }, { upload: sock.waUploadToServer });
    } catch (error) {
      // A broken or unsupported image should not prevent the text/button fallback.
      mediaPayload = null;
    }
  }

  const interactiveMessage = {
    body: { text: body || ' ' },
    footer: footer ? { text: footer } : undefined,
    header: (title || subtitle || mediaPayload) ? {
      title: title || undefined,
      subtitle: subtitle || undefined,
      hasMediaAttachment: Boolean(mediaPayload?.imageMessage),
      ...(mediaPayload || {})
    } : undefined,
    nativeFlowMessage: {
      buttons: nativeButtons,
      messageParamsJson: ''
    },
    contextInfo: {
      isForwarded: true,
      forwardingScore: 999999,
      forwardOrigin: 4,
      forwardedAiBotMessageInfo: {
        botName: 'Meta AI',
        botJid: '13135550002@s.whatsapp.net',
        creatorName: 'Meta'
      }
    }
  };

  const contentPayload = {
    viewOnceMessage: {
      message: {
        messageContextInfo: proto.MessageContextInfo.create({
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        }),
        interactiveMessage
      }
    }
  };

  let fullMsg = null;
  try {
    const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
    fullMsg = generateWAMessageFromContent(jid, contentPayload, {
      logger: sock.logger,
      userJid,
      timestamp: new Date(),
      quoted: quoted || undefined
    });

    const additionalNodes = buildNativeFlowNodes(
      nativeButtons.length,
      jid.endsWith('@g.us'),
      'mixed'
    );

    await sock.relayMessage(jid, fullMsg.message, {
      messageId: fullMsg.key.id,
      additionalNodes
    });

    return fullMsg;
  } catch (err) {
    // Fallback: plain text
    const fallback = fallbackLines.join('\n').trim() || '(empty)';
    try {
      return await sock.sendMessage(jid, { text: fallback }, quoted ? { quoted } : {});
    } catch {
      return await sock.sendMessage(jid, { text: fallback });
    }
  }
}

/**
 * Install `sendInteractive` onto a Baileys socket.
 */
export function attachInteractive(sock) {
  if (!sock || sock.sendInteractive) return sock;
  sock.sendInteractive = async (jid, options = {}, quoted = null) => {
    return sendInteractiveMessage(sock, jid, options, quoted);
  };
  return sock;
}
