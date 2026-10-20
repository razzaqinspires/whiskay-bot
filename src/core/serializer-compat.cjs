/**
 * Baileys Message Serialization & Interactive Helper (Native Flow)
 */

const { 
  proto, 
  generateWAMessageFromContent, 
  downloadContentFromMessage, 
  generateMessageIDV2,
  isJidGroup
} = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const helpers = require('./lib/helpers.cjs');
const freply = require('./lib/freply.cjs');

let callMusicModule = null;
function getCallMusic() {
  if (!callMusicModule) {
    try {
      callMusicModule = require('./callMusic');
    } catch {}
  }
  return callMusicModule;
}

const jidPairs = new Map();
const sentMessageIds = new Set();
const messageStore = new Map();
const MAX_MESSAGE_STORE = 5000;

function storeMessage(rawMsg) {
  if (!rawMsg || !rawMsg.key || !rawMsg.key.id) return;
  const id = rawMsg.key.id;
  const remoteJid = rawMsg.key.remoteJid;
  messageStore.set(id, rawMsg);
  if (remoteJid) {
    messageStore.set(`${remoteJid}:${id}`, rawMsg);
  }
  if (messageStore.size > MAX_MESSAGE_STORE * 2) {
    const it = messageStore.keys();
    for (let i = 0; i < 1000; i++) {
      const next = it.next();
      if (next.done) break;
      messageStore.delete(next.value);
    }
  }
}

function getStoredMessage(id, remoteJid) {
  if (!id) return null;
  if (remoteJid && messageStore.has(`${remoteJid}:${id}`)) {
    return messageStore.get(`${remoteJid}:${id}`);
  }
  return messageStore.get(id) || null;
}

function trackSentMessageId(id) {
  if (!id) return;
  sentMessageIds.add(id);
  const timer = setTimeout(() => {
    sentMessageIds.delete(id);
  }, 120000);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
}

function isBotSentMessage(id) {
  return Boolean(id && sentMessageIds.has(id));
}

function registerJidPair(lid, phone) {
  if (!lid || !phone) return;
  const decLid = String(lid).split(':')[0];
  const decPhone = String(phone).split(':')[0];
  if (decLid.endsWith('@lid') && decPhone.endsWith('@s.whatsapp.net')) {
    jidPairs.set(decLid, decPhone);
  }
}

function syncBotJidPairs(sock) {
  if (!sock) return;
  const phoneCandidate = sock.user?.id || sock.user?.jid || sock.authState?.creds?.me?.id;
  const lidCandidate = sock.user?.lid || sock.authState?.creds?.me?.lid;
  if (phoneCandidate && lidCandidate) {
    const cleanPhone = sock.decodeJid(phoneCandidate);
    const cleanLid = sock.decodeJid(lidCandidate);
    registerJidPair(cleanLid, cleanPhone);
  }
}

function getBotIdentifiers(sock) {
  const identifiers = new Set();
  const add = (id) => {
    if (!id) return;
    const dec = sock.decodeJid ? sock.decodeJid(id) : id;
    identifiers.add(dec);
    const digits = String(dec).replace(/[^0-9]/g, '').split('@')[0];
    if (digits) {
      identifiers.add(digits);
      identifiers.add(`${digits}@s.whatsapp.net`);
    }
  };

  add(sock?.user?.id);
  add(sock?.user?.jid);
  add(sock?.user?.lid);
  add(sock?.authState?.creds?.me?.id);
  add(sock?.authState?.creds?.me?.lid);
  return identifiers;
}

function resolvePhoneJid(sock, jid, key = {}) {
  let decoded = sock.decodeJid(jid);
  if (!decoded) return decoded;

  if (decoded.endsWith('@g.us') || decoded.endsWith('@broadcast') || decoded.endsWith('@newsletter')) {
    return decoded;
  }

  if (decoded.endsWith('@lid')) {
    const normalizedLid = decoded.split(':')[0];
    if (jidPairs.has(normalizedLid)) return jidPairs.get(normalizedLid);
    if (jidPairs.has(decoded)) return jidPairs.get(decoded);

    const myLid = sock.authState?.creds?.me?.lid || sock.user?.lid;
    const myPhone = sock.authState?.creds?.me?.id || sock.user?.id;
    if (myLid && myPhone) {
      const decMyLid = sock.decodeJid(myLid);
      if (decMyLid === decoded || decMyLid.split('@')[0] === decoded.split('@')[0]) {
        return sock.decodeJid(myPhone);
      }
    }

    if (key.participant?.endsWith('@lid') && key.participantAlt?.endsWith('@s.whatsapp.net')) {
      registerJidPair(sock.decodeJid(key.participant), sock.decodeJid(key.participantAlt));
      if (decoded === sock.decodeJid(key.participant)) return sock.decodeJid(key.participantAlt);
    }
    if (key.remoteJid?.endsWith('@lid') && key.remoteJidAlt?.endsWith('@s.whatsapp.net')) {
      registerJidPair(sock.decodeJid(key.remoteJid), sock.decodeJid(key.remoteJidAlt));
      if (decoded === sock.decodeJid(key.remoteJid)) return sock.decodeJid(key.remoteJidAlt);
    }
    return decoded;
  }
  return toJid(decoded);
}

function toJid(str) {
  if (!str) return str;
  if (str.endsWith('@g.us') || str.endsWith('@broadcast') || str.endsWith('@newsletter')) {
    return str;
  }
  let cleaned = str.replace(/[^0-9]/g, '');
  if (!cleaned) return str;
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  return `${cleaned}@s.whatsapp.net`;
}

function getContentType(msg) {
  if (!msg) return '';
  const keys = Object.keys(msg);
  if (keys.length === 0) return '';
  const type = keys.find(k => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage' && k !== 'protocolMessage');
  return type || keys[0];
}

function unwrapMessage(message) {
  if (!message) return { message: null, type: '' };
  let msg = message;
  let type = getContentType(msg);

  let iterations = 0;
  while (msg && iterations < 10) {
    iterations++;
    if (type === 'ephemeralMessage') {
      msg = msg.ephemeralMessage?.message;
    } else if (type === 'viewOnceMessage') {
      msg = msg.viewOnceMessage?.message;
    } else if (type === 'viewOnceMessageV2') {
      msg = msg.viewOnceMessageV2?.message;
    } else if (type === 'viewOnceMessageV2Extension') {
      msg = msg.viewOnceMessageV2Extension?.message;
    } else if (type === 'documentWithCaptionMessage') {
      msg = msg.documentWithCaptionMessage?.message;
    } else if (type === 'deviceSentMessage') {
      msg = msg.deviceSentMessage?.message;
    } else if (type === 'botForwardedMessage') {
      msg = msg.botForwardedMessage?.message;
    } else if (type === 'associatedChildMessage') {
      msg = msg.associatedChildMessage?.message;
    } else if (type === 'groupStatusMessage') {
      msg = msg.groupStatusMessage?.message;
    } else if (type === 'groupStatusMessageV2') {
      msg = msg.groupStatusMessageV2?.message;
    } else if (type === 'editedMessage') {
      msg = msg.editedMessage?.message;
    } else if (type === 'protocolMessage' && msg.protocolMessage?.editedMessage) {
      msg = msg.protocolMessage.editedMessage;
    } else if (type === 'templateMessage') {
      const tm = msg.templateMessage;
      const hydrated = tm?.hydratedTemplate || tm?.hydratedFourRowTemplate || tm?.fourRowTemplate;
      if (hydrated) {
        if (hydrated.imageMessage) msg = { imageMessage: hydrated.imageMessage };
        else if (hydrated.videoMessage) msg = { videoMessage: hydrated.videoMessage };
        else if (hydrated.documentMessage) msg = { documentMessage: hydrated.documentMessage };
        else if (hydrated.locationMessage) msg = { locationMessage: hydrated.locationMessage };
        else msg = { conversation: hydrated.contentText || hydrated.hydratedContentText || '' };
      } else {
        break;
      }
    } else if (type === 'buttonsMessage') {
      const bm = msg.buttonsMessage;
      if (bm.imageMessage) msg = { imageMessage: bm.imageMessage };
      else if (bm.videoMessage) msg = { videoMessage: bm.videoMessage };
      else if (bm.documentMessage) msg = { documentMessage: bm.documentMessage };
      else break;
    } else if (type === 'interactiveMessage') {
      const im = msg.interactiveMessage;
      if (im?.header) {
        if (im.header.imageMessage) msg = { imageMessage: im.header.imageMessage };
        else if (im.header.videoMessage) msg = { videoMessage: im.header.videoMessage };
        else if (im.header.documentMessage) msg = { documentMessage: im.header.documentMessage };
        else break;
      } else {
        break;
      }
    } else {
      break;
    }
    type = getContentType(msg);
  }

  return { message: msg, type };
}

/**
 * Safely downloads media stream or buffer from a media message or quoted media message
 * Handles missing directPath, expired media URLs, and updateMediaMessage re-requests
 * @param {object} target Message wrapper or media payload
 * @param {object} sock Baileys socket instance
 * @param {object} [options]
 * @returns {Promise<Buffer>} Downloaded media buffer
 */
async function downloadMedia(target, sock, options = {}) {
  if (!target) throw new Error('No target message provided for download');

  const targetKey = target.key || (target.stanzaId ? { id: target.stanzaId, remoteJid: target.chat } : null);
  let mediaType = (target.type ? target.type.replace('Message', '').toLowerCase() : '') || target.mediaType || '';
  if (mediaType === 'ptv') mediaType = 'video';

  let payload = target.msg || (target.message && target.type ? target.message[target.type] : target.message) || target;

  if (payload && typeof payload === 'object') {
    if (payload.videoMessage) { payload = payload.videoMessage; mediaType = 'video'; }
    else if (payload.imageMessage) { payload = payload.imageMessage; mediaType = 'image'; }
    else if (payload.stickerMessage) { payload = payload.stickerMessage; mediaType = 'sticker'; }
    else if (payload.documentMessage) { payload = payload.documentMessage; mediaType = 'document'; }
    else if (payload.audioMessage) { payload = payload.audioMessage; mediaType = 'audio'; }
    else if (payload.ptvMessage) { payload = payload.ptvMessage; mediaType = 'video'; }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('No media payload found in message');
  }

  if (!payload.directPath && !payload.url && targetKey?.id) {
    const stored = getStoredMessage(targetKey.id, targetKey.remoteJid);
    if (stored) {
      const unwrapped = unwrapMessage(stored.message);
      const storedPayload = unwrapped.message?.[unwrapped.type] || unwrapped.message;
      if (storedPayload && typeof storedPayload === 'object') {
        if (storedPayload.directPath) payload.directPath = storedPayload.directPath;
        if (storedPayload.url) payload.url = storedPayload.url;
        if (storedPayload.mediaKey) payload.mediaKey = storedPayload.mediaKey;
        if (storedPayload.fileSha256) payload.fileSha256 = storedPayload.fileSha256;
        if (storedPayload.fileEncSha256) payload.fileEncSha256 = storedPayload.fileEncSha256;
        if (storedPayload.mimetype && !payload.mimetype) payload.mimetype = storedPayload.mimetype;
      }
    }
  }

  if (!mediaType) {
    if (payload.mimetype) {
      if (payload.mimetype.includes('image')) mediaType = 'image';
      else if (payload.mimetype.includes('video')) mediaType = 'video';
      else if (payload.mimetype.includes('audio')) mediaType = 'audio';
      else mediaType = 'document';
    } else {
      mediaType = 'image';
    }
  }

  if (!payload.directPath && !payload.url && payload.mediaKey && targetKey && typeof sock?.updateMediaMessage === 'function') {
    try {
      const wrapName = mediaType === 'video' ? 'videoMessage' : (mediaType === 'image' ? 'imageMessage' : `${mediaType}Message`);
      const updateMsg = {
        key: {
          remoteJid: targetKey.remoteJid,
          id: targetKey.id,
          participant: targetKey.participant || undefined,
          fromMe: Boolean(targetKey.fromMe)
        },
        message: { [wrapName]: payload }
      };
      const updated = await Promise.race([
        sock.updateMediaMessage(updateMsg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('updateMediaMessage timeout')), 7000))
      ]);
      const updatedMedia = updated?.message?.[wrapName] || updated?.message;
      if (updatedMedia) {
        if (updatedMedia.directPath) payload.directPath = updatedMedia.directPath;
        if (updatedMedia.url) payload.url = updatedMedia.url;
        if (updatedMedia.mediaKey) payload.mediaKey = updatedMedia.mediaKey;
      }
    } catch {
    }
  }

  let stream = null;
  try {
    stream = await downloadContentFromMessage(payload, mediaType, options);
  } catch (downloadErr) {
    if (payload.mediaKey && targetKey && typeof sock?.updateMediaMessage === 'function') {
      try {
        const wrapName = mediaType === 'video' ? 'videoMessage' : (mediaType === 'image' ? 'imageMessage' : `${mediaType}Message`);
        const updateMsg = {
          key: {
            remoteJid: targetKey.remoteJid,
            id: targetKey.id,
            participant: targetKey.participant || undefined,
            fromMe: Boolean(targetKey.fromMe)
          },
          message: { [wrapName]: payload }
        };
        const updated = await Promise.race([
          sock.updateMediaMessage(updateMsg),
          new Promise((_, reject) => setTimeout(() => reject(new Error('updateMediaMessage timeout')), 7000))
        ]);
        const updatedMedia = updated?.message?.[wrapName] || updated?.message;
        if (updatedMedia?.directPath || updatedMedia?.url) {
          if (updatedMedia.directPath) payload.directPath = updatedMedia.directPath;
          if (updatedMedia.url) payload.url = updatedMedia.url;
          stream = await downloadContentFromMessage(payload, mediaType, options);
        }
      } catch {}
    }

    if (!stream && payload.thumbnailDirectPath && payload.mediaKey) {
      try {
        stream = await downloadContentFromMessage({
          directPath: payload.thumbnailDirectPath,
          mediaKey: payload.mediaKey
        }, 'thumbnail-link', options);
      } catch {}
    }

    if (!stream && payload.jpegThumbnail) {
      const thumb = Buffer.isBuffer(payload.jpegThumbnail)
        ? payload.jpegThumbnail
        : Buffer.from(payload.jpegThumbnail, 'base64');
      if (thumb.length > 0) {
        return thumb;
      }
    }

    if (!stream) {
      throw downloadErr;
    }
  }

  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

function serialize(sock, m) {
  if (!m || !m.key) return m;

  storeMessage(m);
  syncBotJidPairs(sock);

  if (m.key.remoteJid?.endsWith('@lid') && m.key.remoteJidAlt?.endsWith('@s.whatsapp.net')) {
    registerJidPair(sock.decodeJid(m.key.remoteJid), sock.decodeJid(m.key.remoteJidAlt));
  }
  if (m.key.participant?.endsWith('@lid') && m.key.participantAlt?.endsWith('@s.whatsapp.net')) {
    registerJidPair(sock.decodeJid(m.key.participant), sock.decodeJid(m.key.participantAlt));
  }

  m.id = m.key.id || '';

  const botIds = getBotIdentifiers(sock);
  const rawParticipant = m.key.participant ? sock.decodeJid(m.key.participant) : '';
  const participantDigits = rawParticipant.replace(/[^0-9]/g, '').split('@')[0];
  const isFromMyAccount = Boolean(m.key.fromMe) ||
                          Boolean(rawParticipant && (botIds.has(rawParticipant) || botIds.has(participantDigits)));

  m.fromMe = isFromMyAccount;
  m.isBaileys = Boolean(m.id && isBotSentMessage(m.id));

  const rawRemoteJid = sock.decodeJid(m.key.remoteJid || '');
  m.chat = resolvePhoneJid(sock, rawRemoteJid, m.key);
  m.isGroup = m.chat.endsWith('@g.us');

  let rawSender = m.fromMe
    ? (sock.user?.id || sock.authState?.creds?.me?.id || m.key.participant || m.chat)
    : (m.key.participant || m.chat);
  rawSender = sock.decodeJid(rawSender);
  m.sender = resolvePhoneJid(sock, rawSender, m.key);
  if (m.sender && m.sender.endsWith('@g.us') && m.fromMe) {
    const fallbackMe = sock.user?.id || sock.authState?.creds?.me?.id;
    if (fallbackMe) m.sender = sock.decodeJid(fallbackMe);
  }

  m.pushName = m.pushName || 'Users';

  if (m.message) {
    const unwrapped = unwrapMessage(m.message);
    m.message = unwrapped.message;
    m.type = unwrapped.type;

    if (!m.message) {
      m.body = '';
      return m;
    }

    m.msg = m.message[m.type] || m.message;
    m.body = '';

    if (m.type === 'conversation') {
      m.body = m.message.conversation;
    } else if (m.type === 'extendedTextMessage') {
      m.body = m.message.extendedTextMessage?.text || '';
    } else if (m.type === 'imageMessage') {
      m.body = m.message.imageMessage?.caption || '';
    } else if (m.type === 'videoMessage') {
      m.body = m.message.videoMessage?.caption || '';
    } else if (m.type === 'documentMessage') {
      m.body = m.message.documentMessage?.caption || '';
    } else if (m.type === 'interactiveResponseMessage') {
      const interactiveMsg = m.message.interactiveResponseMessage;
      if (interactiveMsg?.nativeFlowResponseMessage) {
        try {
          const params = JSON.parse(interactiveMsg.nativeFlowResponseMessage.paramsJson || '{}');
          m.selectedButtonId = params.id || params.row_id || params.selected_id || params.selectedRowId || interactiveMsg.nativeFlowResponseMessage.name;
          m.body = m.selectedButtonId || '';
        } catch {
          m.body = interactiveMsg.nativeFlowResponseMessage.name || '';
        }
      }
    } else if (m.type === 'templateButtonReplyMessage') {
      m.selectedButtonId = m.message.templateButtonReplyMessage.selectedId;
      m.body = m.selectedButtonId || '';
    } else if (m.type === 'buttonsResponseMessage') {
      m.selectedButtonId = m.message.buttonsResponseMessage.selectedButtonId;
      m.body = m.selectedButtonId || '';
    } else if (m.type === 'listResponseMessage') {
      m.selectedButtonId = m.message.listResponseMessage.singleSelectReply?.selectedRowId;
      m.body = m.selectedButtonId || '';
    } else if (m.type === 'richResponseMessage') {
      const rich = m.message.richResponseMessage || m.message;
      const texts = [];
      if (rich.submessages && Array.isArray(rich.submessages)) {
        for (const sub of rich.submessages) {
          if (sub.messageText) texts.push(sub.messageText);
          if (sub.tableMetadata?.title) texts.push(`[Tabel: ${sub.tableMetadata.title}]`);
          if (sub.codeMetadata?.codeBlocks) {
            texts.push(sub.codeMetadata.codeBlocks.map(c => c.codeContent).join(''));
          }
        }
      }
      m.body = texts.join('\n') || '';
    }

    const contextInfo = m.msg?.contextInfo;
    m.mentionedJid = contextInfo?.mentionedJid || [];

    if (contextInfo?.quotedMessage) {
      const qUnwrapped = unwrapMessage(contextInfo.quotedMessage);
      const qMsg = qUnwrapped.message;
      const qType = qUnwrapped.type;

      if (qMsg) {
        const qPayload = (qMsg[qType] && typeof qMsg[qType] === 'object') ? qMsg[qType] : qMsg;
        const qKey = {
          remoteJid: m.chat,
          fromMe: contextInfo.participant === sock.decodeJid(sock.user?.id),
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        };

        if ((!qPayload.directPath && !qPayload.url) && contextInfo.stanzaId) {
          const stored = getStoredMessage(contextInfo.stanzaId, m.chat);
          if (stored) {
            const storedUnwrapped = unwrapMessage(stored.message);
            const storedPayload = storedUnwrapped.message?.[storedUnwrapped.type] || storedUnwrapped.message;
            if (storedPayload && typeof storedPayload === 'object') {
              if (storedPayload.directPath) qPayload.directPath = storedPayload.directPath;
              if (storedPayload.url) qPayload.url = storedPayload.url;
              if (storedPayload.mediaKey) qPayload.mediaKey = storedPayload.mediaKey;
              if (storedPayload.fileSha256) qPayload.fileSha256 = storedPayload.fileSha256;
              if (storedPayload.fileEncSha256) qPayload.fileEncSha256 = storedPayload.fileEncSha256;
              if (storedPayload.mimetype && !qPayload.mimetype) qPayload.mimetype = storedPayload.mimetype;
            }
          }
        }

        m.quoted = {
          key: qKey,
          message: qMsg,
          type: qType,
          msg: qPayload,
          mimetype: qPayload.mimetype || '',
          mediaKey: qPayload.mediaKey || null,
          directPath: qPayload.directPath || '',
          url: qPayload.url || '',
          sender: sock.decodeJid(contextInfo.participant || m.chat),
          fromMe: contextInfo.participant === sock.decodeJid(sock.user?.id),
          text: qMsg.conversation || qMsg.extendedTextMessage?.text || qPayload.caption || qPayload.text || '',
          delete: async () => {
            return await sock.sendMessage(m.chat, {
              delete: {
                remoteJid: m.chat,
                fromMe: Boolean(contextInfo.participant === sock.decodeJid(sock.user?.id)),
                id: qKey.id,
                participant: contextInfo.participant || m.chat
              }
            });
          },
          download: async (opts = {}) => {
            return await downloadMedia(m.quoted, sock, opts);
          }
        };
      } else {
        m.quoted = null;
      }
    } else {
      m.quoted = null;
    }

    if (m.type && m.type.endsWith('Message') && m.type !== 'conversation' && m.type !== 'extendedTextMessage' && m.msg) {
      m.download = async (opts = {}) => {
        return await downloadMedia(m, sock, opts);
      };
    }
  }

  m.reply = async (text, quoted = m, options = {}) => {
    let target = m.chat;
    if (target.endsWith('@lid')) {
      target = resolvePhoneJid(sock, target, m.key);
    }

    let safeQuoted = quoted;
    if (typeof quoted === 'string' && quoted.trim()) {
      safeQuoted = freply.createFakeReply(quoted, { text, ...options });
    } else if (options && (options.fake || options.freply)) {
      safeQuoted = freply.createFakeReply(options.fake || options.freply, { text, ...options });
    }

    if (safeQuoted && safeQuoted.key) {
      const isGroupChat = target.endsWith('@g.us');
      let quotedParticipant = safeQuoted.key.participant || safeQuoted.sender || undefined;

      if (isGroupChat) {
        if (safeQuoted.key.fromMe) {
          quotedParticipant = sock.decodeJid(sock.user?.id || sock.authState?.creds?.me?.id || '') || undefined;
        } else if (quotedParticipant && quotedParticipant.endsWith('@g.us')) {
          quotedParticipant = undefined;
        }
      }

      let remoteJid = target;
      if (
        safeQuoted.key.remoteJid === 'status@broadcast' ||
        (typeof safeQuoted.key.remoteJid === 'string' && (
          safeQuoted.key.remoteJid.endsWith('@newsletter') ||
          safeQuoted.key.remoteJid.endsWith('@g.us')
        ))
      ) {
        remoteJid = safeQuoted.key.remoteJid;
      }

      safeQuoted = {
        key: {
          remoteJid,
          id: safeQuoted.key.id,
          fromMe: Boolean(safeQuoted.key.fromMe),
          participant: quotedParticipant
        },
        message: safeQuoted.message || { conversation: typeof text === 'string' ? text : 'Reply' }
      };
    }

    try {
      return await sock.sendMessage(target, { text, ...options }, { quoted: safeQuoted });
    } catch (err) {
      const isConnError =
        err?.message === 'Connection Closed' ||
        err?.message?.includes('Connection Closed') ||
        err?.message?.includes('WebSocket was closed') ||
        err?.output?.statusCode === 428;
      if (isConnError) {
        throw err;
      }
      return await sock.sendMessage(target, { text, ...options });
    }
  };

  m.freply = async (text, type = 'trolley', options = {}) => {
    const fake = freply.createFakeReply(type, { ...options, text });
    return m.reply(text, fake, options);
  };
  m.replyFake = m.freply;
  m.getFake = (type, options = {}) => freply.createFakeReply(type, options);
  m.createFake = m.getFake;
  m.fake = freply;

  m.react = (emoji) => {
    let target = m.chat;
    if (target.endsWith('@lid')) {
      target = resolvePhoneJid(sock, target, m.key);
    }
    return sock.sendMessage(target, { react: { text: emoji, key: m.key } });
  };

  m.sendInteractive = (data) => sock.sendInteractive(m.chat, data, m);
  m.sendRichMessage = (submessages, options = {}) => sock.sendRichMessage(m.chat, submessages, m, options);
  m.sendLink = (text, links, options = {}) => sock.sendLink(m.chat, text, links, m, options);
  m.sendLinkV2 = (text, links, options = {}) => sock.sendLinkV2(m.chat, text, links, m, options);
  m.sendTable = (title, headers, rows, options = {}) => sock.sendTable(m.chat, title, headers, rows, m, options);
  m.sendTableV2 = (table, options = {}) => sock.sendTableV2(m.chat, table, m, options);
  m.sendCodeBlock = (code, options = {}) => sock.sendCodeBlock(m.chat, code, m, options);
  m.sendCodeBlockV2 = (code, options = {}) => sock.sendCodeBlockV2(m.chat, code, m, options);
  m.sendList = (title, items, options = {}) => sock.sendList(m.chat, title, items, m, options);
  m.airich = () => new helpers.AIRich(sock);
  m.rich = () => new helpers.AIRich(sock);
  m.delete = async (key = m.key) => sock.sendMessage(m.chat, { delete: key });

  m.call = async (opts = {}) => sock.offerCall(m.sender || m.chat, opts);
  m.makeCall = m.call;
  m.callMusic = async (query, opts = {}) => sock.playCallMusic(m.chat, query, { quoted: m, ...opts });
  m.answerCall = async (opts = {}) => sock.answerCallMusic(m.chat, opts);
  m.skipCall = async (opts = {}) => sock.skipCall(m.chat, opts);
  m.getCallQueue = () => sock.getCallQueue();
  m.stopCall = async () => sock.stopCall(m.chat || m.sender);
  m.rejectCall = async (callId) => sock.rejectCall(callId, m.sender || m.chat);
  m.acceptCall = async (callId) => sock.acceptCall(callId, m.sender || m.chat);
  m.terminateCall = async (callId, reason = 'hangup') => sock.terminateCall(callId, m.sender || m.chat, reason);
  m.createCallLink = async (type = 'audio') => sock.createCallLink(type);
  m.sendCallLog = async (title, callType = 1) => sock.sendCallLog(m.chat, title, callType);

  return m;
}

/**
 * Serializes raw WhatsApp VoIP Call Event into an interactive call object
 * Resolves LID to Phone JID, handles callerPn, and attaches VoIP control methods
 * @param {object} sock Baileys socket
 * @param {object} call Raw call event node from Baileys
 * @returns {object} Serialized call wrapper
 */
function serializeCall(sock, call) {
  if (!call) return call;
  const rawFrom = call.from || call.chatId || '';
  const callerPn = call.callerPn || '';

  if (rawFrom.endsWith('@lid') && callerPn) {
    const cleanPn = callerPn.includes('@') ? callerPn : `${callerPn.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    registerJidPair(sock.decodeJid(rawFrom), sock.decodeJid(cleanPn));
  }

  const resolvedFrom = resolvePhoneJid(sock, callerPn || rawFrom, {
    participant: rawFrom,
    participantAlt: callerPn
  });

  const callerNumber = (resolvedFrom || callerPn || rawFrom).split('@')[0].replace(/[^0-9]/g, '');
  const isVideo = Boolean(call.isVideo);
  const isGroup = Boolean(call.isGroup || (call.chatId && call.chatId.endsWith('@g.us')));
  const callId = call.id || ('00' + crypto.randomBytes(16).toString('hex').slice(2)).toUpperCase();
  const status = call.status || 'offer';

  const serialized = {
    ...call,
    id: callId,
    from: resolvedFrom || rawFrom,
    rawFrom,
    callerPn,
    callerNumber,
    chatId: resolvePhoneJid(sock, call.chatId || rawFrom),
    isVideo,
    isGroup,
    status,
    date: call.date instanceof Date ? call.date : new Date(call.date || Date.now()),

    reject: async () => sock.rejectCall(callId, rawFrom || resolvedFrom),
    accept: async () => sock.acceptCall(callId, rawFrom || resolvedFrom),
    terminate: async (reason = 'hangup') => sock.terminateCall(callId, rawFrom || resolvedFrom, reason),
    reply: async (text, options = {}) => sock.sendMessage(resolvedFrom || rawFrom, { text, ...options }),
    playMusic: async (query, options = {}) => sock.playCallMusic(resolvedFrom || rawFrom, query, options),
    stopMusic: async () => sock.stopCall(resolvedFrom || rawFrom),
    createCallLink: async (type = 'audio') => sock.createCallLink(type),
    sendCallLog: async (title, callType = 1) => sock.sendCallLog(resolvedFrom || rawFrom, title, callType),
    sendInteractive: async (options) => sock.sendInteractive(resolvedFrom || rawFrom, options)
  };

  return serialized;
}

function extendSocket(sock) {
  const originalSendMessage = typeof sock.sendMessage === 'function' ? sock.sendMessage.bind(sock) : null;
  sock.sendMessage = async (jid, content, options = {}) => {
    if (options?.messageId) trackSentMessageId(options.messageId);
    if (!originalSendMessage) return null;
    const res = await originalSendMessage(jid, content, options);
    if (res?.key?.id) trackSentMessageId(res.key.id);
    return res;
  };

  const originalRelayMessage = typeof sock.relayMessage === 'function' ? sock.relayMessage.bind(sock) : null;
  sock.relayMessage = async (jid, message, options = {}) => {
    if (options?.messageId) trackSentMessageId(options.messageId);
    if (!originalRelayMessage) return null;
    const res = await originalRelayMessage(jid, message, options);
    if (typeof res === 'string') trackSentMessageId(res);
    if (res?.key?.id) trackSentMessageId(res.key.id);
    return res;
  };

  const originalDecodeJid = sock.decodeJid;
  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    let decoded = jid;
    if (originalDecodeJid) {
      try { decoded = originalDecodeJid(jid); } catch {}
    }
    if (/:\d+@/gi.test(decoded)) {
      decoded = decoded.replace(/:\d+@/gi, '@');
    }
    return decoded;
  };

  function buildNativeFlowBinaryNodes(buttons = [], isGroup = false, flowName = 'mixed') {
    const randomHex = crypto.randomBytes(20).toString('hex');
    const qualityContent = {
      tag: 'quality_control',
      attrs: {
        decision_id: randomHex,
        source_type: 'third_party'
      },
      content: [{ tag: 'decision_source', attrs: { value: 'df' } }]
    };
    
    const bizAttributes = {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: `${Date.now() / 1000 | 0}`
    };

    const nodes = [{
      tag: 'biz',
      attrs: bizAttributes,
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: flowName } }]
        },
        qualityContent
      ]
    }];

    if (!isGroup) {
      nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }

    return nodes;
  }

  sock.sendInteractive = async (jid, options = {}, quoted = null) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const isGroup = isJidGroup(targetJid);
    const {
      title = '',
      subtitle = '',
      body = '',
      footer = '',
      listSections = null,
      sections = null,
      listTitle = '',
      display_text = ''
    } = options;

    let buttonList = Array.isArray(options.buttons) ? [...options.buttons] : [];

    const resolvedListSections = listSections || sections;
    if (resolvedListSections && Array.isArray(resolvedListSections) && resolvedListSections.length > 0) {
      const alreadyHasList = buttonList.some(b => b.type === 'single_select' || b.name === 'single_select' || b.type === 'list' || b.name === 'list');
      if (!alreadyHasList) {
        buttonList.unshift({
          name: 'single_select',
          title: listTitle || display_text || 'choose',
          sections: resolvedListSections
        });
      }
    }

    let cleanQuoted = null;
    if (quoted && quoted.key) {
      let qPart = quoted.key.participant || quoted.sender;
      if (targetJid.endsWith('@g.us')) {
        if (quoted.key.fromMe) {
          qPart = sock.decodeJid(sock.user?.id || sock.authState?.creds?.me?.id || '') || undefined;
        } else if (qPart && qPart.endsWith('@g.us')) {
          qPart = undefined;
        }
      }
      cleanQuoted = {
        key: {
          remoteJid: targetJid,
          id: quoted.key.id,
          fromMe: Boolean(quoted.key.fromMe),
          participant: qPart
        },
        message: quoted.message || { conversation: body || 'Interactive' }
      };
    }

    let fallbackText = '';
    if (title) fallbackText += `*${title}*\n`;
    if (subtitle) fallbackText += `_${subtitle}_\n`;
    if (title || subtitle) fallbackText += `\n`;
    if (body) fallbackText += `${body}\n`;

    if (resolvedListSections && resolvedListSections.length > 0) {
      for (const sec of resolvedListSections) {
        if (sec.title) fallbackText += `\n*─── ${sec.title} ───*\n`;
        if (Array.isArray(sec.rows)) {
          for (const row of sec.rows) {
            fallbackText += `• *${row.title}*${row.description ? ` - _${row.description}_` : ''}\n`;
          }
        }
      }
    }

    const nonListButtons = buttonList.filter(b => b.name !== 'single_select' && b.type !== 'single_select' && b.name !== 'list' && b.type !== 'list');
    if (nonListButtons.length > 0) {
      fallbackText += `\n*─── Choice ───*\n`;
      for (const btn of nonListButtons) {
        const btnLabel = btn.display_text || btn.title || btn.id || 'Button';
        const btnCmd = btn.id || btnLabel;
        fallbackText += `• *${btnLabel}* (${btnCmd})\n`;
      }
    }
    if (footer) fallbackText += `\n_${footer}_`;

    const nativeButtons = buttonList.map((b, idx) => {
      let buttonName = b.type || b.name || 'quick_reply';
      let existingParams = {};
      if (b.buttonParamsJson) {
        try {
          existingParams = typeof b.buttonParamsJson === 'string' ? JSON.parse(b.buttonParamsJson) : b.buttonParamsJson;
        } catch {}
      }

      let buttonParamsJson = {};
      
      if (buttonName === 'open_webview' || buttonName === 'cta_url' || buttonName === 'url') {
        buttonName = 'cta_url';
        const targetUrl = b.url || b.link || existingParams.url || 'https://google.com';
        buttonParamsJson = {
          display_text: b.title || b.display_text || existingParams.display_text || 'Open Link',
          url: targetUrl,
          merchant_url: b.merchant_url || existingParams.merchant_url || targetUrl,
          webview_interaction: b.webview_interaction !== undefined ? Boolean(b.webview_interaction) : (existingParams.webview_interaction !== undefined ? Boolean(existingParams.webview_interaction) : true),
          ...(existingParams || {}),
          ...(b.options || {})
        };
      } else if (buttonName === 'cta_call' || buttonName === 'call') {
        buttonName = 'cta_call';
        const rawPhone = b.phone || b.phone_number || existingParams.phone || existingParams.phone_number || '6281234567890';
        const cleanPhone = String(rawPhone).replace(/[^0-9+]/g, '');
        buttonParamsJson = {
          display_text: b.title || b.display_text || existingParams.display_text || 'Telephone',
          phone: cleanPhone,
          phone_number: cleanPhone
        };
      } else if (buttonName === 'cta_copy' || buttonName === 'copy') {
        buttonName = 'cta_copy';
        buttonParamsJson = {
          display_text: b.title || b.display_text || existingParams.display_text || 'Copy',
          id: b.id || b.copy_code || existingParams.id || existingParams.copy_code || `copy_${idx}`,
          copy_code: b.copy_code || b.id || existingParams.copy_code || existingParams.id || 'COPY_ME'
        };
      } else if (buttonName === 'single_select' || buttonName === 'list') {
        buttonName = 'single_select';
        buttonParamsJson = {
          title: b.title || b.display_text || existingParams.title || listTitle || 'Pilih Opsi',
          sections: b.sections || b.listSections || existingParams.sections || []
        };
      } else {
        buttonName = 'quick_reply';
        buttonParamsJson = {
          display_text: b.title || b.display_text || existingParams.display_text || 'Reply',
          id: b.id || existingParams.id || `btn_${idx}`
        };
      }
      
      return {
        name: buttonName,
        buttonParamsJson: JSON.stringify(buttonParamsJson)
      };
    });

    let mediaPayload = null;
    const mediaSource = options.image || options.media;
    if (mediaSource && sock.waUploadToServer) {
      try {
        const { prepareWAMessageMedia } = require('@whiskeysockets/baileys');
        const formatted = Buffer.isBuffer(mediaSource)
          ? mediaSource
          : typeof mediaSource === 'string'
          ? { url: mediaSource }
          : mediaSource;
        mediaPayload = await prepareWAMessageMedia({ image: formatted }, { upload: sock.waUploadToServer });
      } catch {}
    }

    const interactiveHeader = (title || subtitle || mediaPayload) ? {
      title: title || undefined,
      subtitle: subtitle || undefined,
      hasMediaAttachment: Boolean(mediaPayload?.imageMessage || mediaPayload),
      ...(mediaPayload || {})
    } : undefined;

    let resolvedContextInfo = options.contextInfo || {};
    if (!resolvedContextInfo.externalAdReply && (options.thumbnail || options.image)) {
      const thumbUrl = typeof options.thumbnail === 'string'
        ? options.thumbnail
        : (typeof options.image === 'string' ? options.image : undefined);
      if (thumbUrl) {
        resolvedContextInfo.externalAdReply = {
          title: title || 'Zettai Bot',
          body: subtitle || footer || 'Command Menu',
          thumbnailUrl: thumbUrl,
          sourceUrl: options.url || 'https://whatsapp.com',
          mediaType: 1,
          renderLargerThumbnail: true
        };
      }
    }

    const aiRichMeta = {
      isForwarded: true,
      forwardingScore: 999999,
      forwardOrigin: 4,
      forwardedAiBotMessageInfo: {
        botName: options.botName || 'Meta AI',
        botJid: options.botJid || '13135550002@s.whatsapp.net',
        creatorName: options.creatorName || 'Meta'
      }
    };

    if (options.ephemeral || options.expiration) {
      aiRichMeta.expiration = options.expiration || 86400;
      aiRichMeta.ephemeralSettingTimestamp = Math.floor(Date.now() / 1000);
    }

    const finalContextInfo = {
      ...aiRichMeta,
      ...resolvedContextInfo
    };

    const interactiveMessage = {
      header: interactiveHeader,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      contextInfo: finalContextInfo,
      nativeFlowMessage: {
        buttons: nativeButtons,
        messageParamsJson: ''
      }
    };

    let contentPayload;
    if (options.wrapper === 'ephemeral' || options.ephemeral) {
      contentPayload = {
        ephemeralMessage: {
          message: {
            messageContextInfo: proto.MessageContextInfo.create({
              deviceListMetadata: {},
              deviceListMetadataVersion: 2
            }),
            interactiveMessage
          }
        }
      };
    } else {
      contentPayload = {
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
    }

    const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
    let fullMsg = generateWAMessageFromContent(targetJid, contentPayload, {
      logger: sock.logger,
      userJid,
      messageId: generateMessageIDV2 ? generateMessageIDV2(userJid) : undefined,
      timestamp: new Date(),
      quoted: cleanQuoted || undefined
    });

    const additionalNodes = [
      // Match the supplied working serializer: native-flow envelope stays `mixed`,
      // while the actual button name carries `single_select`.
      ...buildNativeFlowBinaryNodes(nativeButtons, isGroup, 'mixed'),
      ...(Array.isArray(options.additionalNodes) ? options.additionalNodes : [])
    ];

    try {
      await sock.relayMessage(targetJid, fullMsg?.message, {
        messageId: fullMsg?.key?.id,
        additionalNodes,
        ...options
      });
      return fullMsg;
    } catch (err) {
      console.warn('[Interactive Relay Warning]', err?.message || err);
      try {
        return await sock.sendMessage(targetJid, { text: fallbackText.trim() }, { quoted: cleanQuoted || undefined });
      } catch {
        return await sock.sendMessage(targetJid, { text: fallbackText.trim() });
      }
    }
  };

  sock.sendRichMessage = async (jid, submessages, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateRichMessageContent(submessages, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendTable = async (jid, title, headers, rows, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateTableContent(title, headers, rows, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendTableV2 = async (jid, table, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateTableContentV2(table, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendList = async (jid, title, items, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateListContent(title, items, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendCodeBlock = async (jid, code, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateCodeBlockContent(code, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendCodeBlockV2 = async (jid, code, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateCodeBlockContentV2(code, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendLink = async (jid, text, links, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateLinkContent(text, links, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendLinkV2 = async (jid, text, links, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateLinkContentV2(text, links, quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendLatex = async (jid, quoted = null, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateLatexContent(quoted, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.sendUnifiedResponse = async (jid, quoted = null, captured = {}, options = {}) => {
    let targetJid = resolvePhoneJid(sock, jid, quoted?.key || {});
    const content = helpers.generateUnifiedResponseContent(quoted, captured, options);
    return await sock.relayMessage(targetJid, content.message, {
      messageId: content.messageId,
      ...options
    });
  };

  sock.captureUnifiedResponse = helpers.captureUnifiedResponse;

  sock.richMessage = () => new helpers.AIRich(sock);
  sock.airich = () => new helpers.AIRich(sock);
  sock.Rich = () => new helpers.Rich(sock);
  sock.buttonBuilder = () => new helpers.Button(sock);
  sock.buttonV2Builder = () => new helpers.ButtonV2(sock);
  sock.carouselBuilder = () => new helpers.Carousel(sock);

  sock.sendFakeReply = async (jid, text, type = 'trolley', options = {}) => {
    const fake = freply.createFakeReply(type, { ...options, text });
    let target = resolvePhoneJid(sock, jid, fake?.key || {});
    return await sock.sendMessage(target, { text, ...options }, { quoted: fake });
  };
  sock.createFakeReply = (type, options = {}) => freply.createFakeReply(type, options);
  sock.freply = freply;

  const originalRejectCall = typeof sock.rejectCall === 'function' ? sock.rejectCall.bind(sock) : null;
  const originalCreateCallLink = typeof sock.createCallLink === 'function' ? sock.createCallLink.bind(sock) : null;

  /**
   * Generates official WhatsApp Call Link (voice or video room)
   * Uses Baileys Native Call Link or stanza query
   * @param {'audio'|'video'} [type='audio']
   * @param {object} [event]
   * @param {number} [timeoutMs=4000]
   * @returns {Promise<string|null>}
   */
  sock.createCallLink = async (type = 'audio', event, timeoutMs = 4000) => {
    const prefix = type === 'video' ? 'https://call.whatsapp.com/video/' : 'https://call.whatsapp.com/voice/';
    try {
      if (originalCreateCallLink) {
        const token = await originalCreateCallLink(type, event, timeoutMs);
        if (token) return `${prefix}${token}`;
      }
      if (typeof sock.query === 'function') {
        const msgTag = sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now());
        const result = await sock.query({
          tag: 'call',
          attrs: { id: msgTag, to: '@call' },
          content: [
            {
              tag: 'link_create',
              attrs: { media: type },
              content: event ? [{ tag: 'event', attrs: { start_time: String(event.startTime) } }] : undefined
            }
          ]
        }, timeoutMs);
        const { getBinaryNodeChild } = require('@whiskeysockets/baileys');
        const child = getBinaryNodeChild(result, 'link_create');
        if (child?.attrs?.token) {
          return `${prefix}${child.attrs.token}`;
        }
      }
    } catch {}
    return null;
  };

  /**
   * Places an outbound WhatsApp Call offer (baileys-caller / whatsmeow pattern)
   * Sends authentic call stanza, subscribes to presence, and generates session
   * @param {string} toJid
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  sock.offerCall = async (toJid, options = {}) => {
    let cleanJid = sock.decodeJid(toJid);
    if (cleanJid && !cleanJid.includes('@')) {
      cleanJid = `${cleanJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    }
    const callId = ('00' + crypto.randomBytes(16).toString('hex').slice(2)).toUpperCase();
    const meAuth = sock.authState?.creds?.me?.id || sock.user?.id || '0@s.whatsapp.net';
    const meBareJid = meAuth.split(':')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    const meDeviceJid = meAuth.includes('@') ? meAuth : `${meAuth}@s.whatsapp.net`;
    const stanzaId = sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now());

    try {
      if (typeof sock.presenceSubscribe === 'function') {
        await sock.presenceSubscribe(cleanJid).catch(() => {});
      }
    } catch {}

    const callOfferNode = {
      tag: 'call',
      attrs: {
        from: meDeviceJid,
        to: cleanJid,
        id: stanzaId
      },
      content: [
        {
          tag: 'offer',
          attrs: {
            'call-id': callId,
            'call-creator': meBareJid,
            'device_class': '2015'
          },
          content: [
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
            { tag: 'net', attrs: { medium: '3' } },
            { tag: 'capability', attrs: { ver: '1' } },
            { tag: 'encopt', attrs: { keygen: '2' } }
          ]
        }
      ]
    };

    let stanzaSent = false;
    try {
      if (typeof sock.sendNode === 'function') {
        await sock.sendNode(callOfferNode);
        stanzaSent = true;
      }
    } catch {
      stanzaSent = false;
    }

    try {
      if (typeof sock.getUSyncDevices === 'function') {
        const devices = await sock.getUSyncDevices([cleanJid], true, false).catch(() => []);
        if (Array.isArray(devices)) {
          for (const dev of devices) {
            if (dev && dev.jid && dev.jid !== cleanJid) {
              const devNode = {
                tag: 'call',
                attrs: {
                  from: meDeviceJid,
                  to: dev.jid,
                  id: (sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now()))
                },
                content: callOfferNode.content
              };
              await sock.sendNode(devNode).catch(() => {});
            }
          }
        }
      }
    } catch (syncErr) {}

    if (options.title || options.banner) {
      await sock.sendCallLog(cleanJid, options.title || '📞 Voice Call', options.callType || 1).catch(() => {});
    }

    return {
      callId,
      target: cleanJid,
      status: 'ringing',
      stanzaSent,
      end: async (reason = 'hangup') => sock.terminateCall(callId, cleanJid, reason),
      reject: async () => sock.rejectCall(callId, cleanJid)
    };
  };
  sock.makeCall = sock.offerCall;

  /**
   * Rejects an incoming call stanza (whatsmeow / baileys pattern)
   * Dispatches direct binary node via sendNode (NEVER query) to avoid 60s timeout
   * @param {string} callId
   * @param {string} callFrom
   * @returns {Promise<void>}
   */
  sock.rejectCall = async (callId, callFrom) => {
    if (!callId || !callFrom) return;
    const myJid = sock.decodeJid(sock.user?.id || sock.authState?.creds?.me?.id || '0@s.whatsapp.net');
    const stanza = {
      tag: 'call',
      attrs: {
        from: myJid,
        to: callFrom
      },
      content: [
        {
          tag: 'reject',
          attrs: {
            'call-id': callId,
            'call-creator': callFrom,
            count: '0'
          }
        }
      ]
    };
    try {
      if (typeof sock.sendNode === 'function') {
        await sock.sendNode(stanza);
      }
    } catch {}
  };

  /**
   * Accepts an incoming WhatsApp call (whatsmeow / baileys-caller pattern)
   * @param {string} callId
   * @param {string} callFrom
   * @returns {Promise<void>}
   */
  sock.acceptCall = async (callId, callFrom) => {
    if (!callId || !callFrom) return;
    const stanzaId = sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now());
    const stanza = {
      tag: 'call',
      attrs: {
        to: callFrom,
        id: stanzaId
      },
      content: [
        {
          tag: 'accept',
          attrs: {
            'call-id': callId,
            'call-creator': callFrom
          },
          content: [
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
            { tag: 'net', attrs: { medium: '3' } }
          ]
        }
      ]
    };
    try {
      if (typeof sock.sendNode === 'function') {
        await sock.sendNode(stanza);
      }
    } catch {}
  };

  /**
   * Terminates / hangs up a call on WhatsApp (baileys-caller / whatsmeow pattern)
   * @param {string} callId
   * @param {string} toJid
   * @param {string} [reason='hangup']
   * @returns {Promise<void>}
   */
  sock.terminateCall = async (callId, toJid, reason = 'hangup') => {
    if (!toJid) return;
    const cleanJid = sock.decodeJid(toJid);
    const myJid = sock.decodeJid(sock.user?.id || sock.authState?.creds?.me?.id || '0@s.whatsapp.net');
    const stanzaId = sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now());
    const stanza = {
      tag: 'call',
      attrs: {
        to: cleanJid,
        id: stanzaId
      },
      content: [
        {
          tag: 'terminate',
          attrs: {
            'call-id': callId || ('00' + crypto.randomBytes(16).toString('hex').slice(2)).toUpperCase(),
            'call-creator': myJid,
            reason: reason || 'hangup'
          }
        }
      ]
    };
    try {
      if (typeof sock.sendNode === 'function') {
        await sock.sendNode(stanza);
      }
    } catch {}
  };

  /**
   * Posts in-chat scheduled call log banner to target JID
   * @param {string} jid
   * @param {string} title
   * @param {number} [callType=1] 1 = VOICE, 2 = VIDEO
   * @returns {Promise<void>}
   */
  sock.sendCallLog = async (jid, title = 'Voice Call', callType = 1) => {
    try {
      const targetJid = sock.decodeJid(jid);
      if (targetJid && !targetJid.endsWith('@g.us') && typeof sock.relayMessage === 'function') {
        const message = {
          scheduledCallCreationMessage: {
            scheduledTimestampMs: Date.now(),
            callType: callType || 1,
            title: title || '📞 Voice Call'
          }
        };
        const waMsg = generateWAMessageFromContent(targetJid, message, {});
        if (waMsg) {
          await sock.relayMessage(targetJid, waMsg.message, { messageId: waMsg.key.id }).catch(() => {});
        }
      }
    } catch {}
  };

  /**
   * Plays music inside a WhatsApp voice call session
   * @param {string} jid
   * @param {string} query
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  sock.playCallMusic = async (jid, query, options = {}) => {
    const callMusic = getCallMusic();
    if (!callMusic || typeof callMusic.executeCallMusic !== 'function') {
      throw new Error('callMusic engine not available');
    }
    const cleanJid = sock.decodeJid(jid);
    const mockM = {
      chat: cleanJid,
      sender: cleanJid,
      isGroup: cleanJid.endsWith('@g.us'),
      reply: async (text) => sock.sendMessage(cleanJid, { text })
    };
    return await callMusic.executeCallMusic(sock, options.quoted || mockM, query, options.config || {});
  };

  /**
   * Stops active voice call session for a given JID
   * @param {string} jid
   * @returns {boolean}
   */
  sock.stopCall = async (jid) => {
    const callMusic = getCallMusic();
    if (callMusic && typeof callMusic.stopCallMusicSession === 'function') {
      return callMusic.stopCallMusicSession(jid, sock);
    }
    return false;
  };

  /**
   * Answers pending voice call and starts in-call music stream
   * @param {string} jid
   * @param {object} [options={}]
   * @returns {Promise<boolean>}
   */
  sock.answerCallMusic = async (jid, options = {}) => {
    const callMusic = getCallMusic();
    if (!callMusic || typeof callMusic.startInCallMusic !== 'function' || typeof callMusic.getActiveCallSession !== 'function') {
      return false;
    }
    const cleanJid = sock.decodeJid(jid);
    const session = callMusic.getActiveCallSession(cleanJid);
    if (session) {
      await callMusic.startInCallMusic(sock, session, cleanJid, options.config || {});
      return true;
    }
    return false;
  };

  /**
   * Skips active call and moves to next queued song
   * @param {string} jid
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  sock.skipCall = async (jid, options = {}) => {
    const callMusic = getCallMusic();
    if (callMusic && typeof callMusic.skipCallMusicSession === 'function') {
      return await callMusic.skipCallMusicSession(jid, sock, options.config || {});
    }
    return { skipped: false };
  };

  /**
   * Returns current call queue status
   * @returns {object}
   */
  sock.getCallQueue = () => {
    const callMusic = getCallMusic();
    if (callMusic && typeof callMusic.getCallQueueList === 'function') {
      return callMusic.getCallQueueList();
    }
    return { active: null, queued: [], total: 0 };
  };

  /**
   * Returns active call music sessions
   * @returns {Array<object>}
   */
  sock.getActiveCallSessions = () => {
    const callMusic = getCallMusic();
    if (callMusic && typeof callMusic.getActiveCallSessions === 'function') {
      return callMusic.getActiveCallSessions();
    }
    return [];
  };

  /**
   * Serializes raw call event into rich interactive call object
   * @param {object} call
   * @returns {object}
   */
  sock.serializeCall = (call) => serializeCall(sock, call);

  /**
   * Universal WhatsApp Incoming Call Orchestrator
   * Handles incoming call stanzas, resolves LID, answers/signals cleanly via sendNode,
   * and routes to Call Music engine for immediate playback.
   * @param {Array<object>} calls
   * @param {object} [customConfig={}]
   * @returns {Promise<void>}
   */
  sock.handleIncomingCall = async (calls, customConfig = {}) => {
    if (!Array.isArray(calls) || calls.length === 0) return;
    const callMusic = getCallMusic();
    if (callMusic && typeof callMusic.handleIncomingCall === 'function') {
      return await callMusic.handleIncomingCall(sock, calls, customConfig);
    }
  };
  sock.handleCall = sock.handleIncomingCall;
}

module.exports = {
  toJid,
  serialize,
  serializeCall,
  extendSocket,
  unwrapMessage,
  downloadMedia,
  storeMessage,
  getStoredMessage,
  registerJidPair,
  syncBotJidPairs,
  getBotIdentifiers,
  trackSentMessageId,
  isBotSentMessage,
  freply,
  createFakeReply: freply.createFakeReply,
  ...helpers
};