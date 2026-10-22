/** ESM facade over the project's CommonJS Baileys serializer compatibility layer. */
import compat from './serializer-compat.cjs';
export const sendInteractiveMessage = compat.sendInteractiveMessage;
export const serialize = compat.serialize;
export const extendSocket = compat.extendSocket;
export const unwrapMessage = compat.unwrapMessage;
export const downloadMedia = compat.downloadMedia;
export default compat;
