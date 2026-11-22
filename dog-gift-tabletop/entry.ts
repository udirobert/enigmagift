/* Entry router: the personal-photo app owns ?photo=1 (creator, recipient
   and management all live behind its fragment) and a plain ?make=1 with no
   legacy context. Everything else — legacy #gift/#manage links, recipient
   previews and ?make=1&sample=1 — stays with the sample room in main.ts. */

const params = new URLSearchParams(location.search);
const hash = location.hash;

const isPhotoApp = params.get('photo') === '1'
  || (params.get('make') === '1'
    && !hash.includes('gift=') && !hash.includes('manage=')
    && params.get('recipientPreview') !== '1'
    && params.get('sample') !== '1');

void (isPhotoApp ? import('./photo-app') : import('./main'));
export {};
