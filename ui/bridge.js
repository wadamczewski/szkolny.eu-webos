// Calls the app's JS service over the luna bus. In a desktop browser (tools/dev-server.mjs)
// the same methods are served over HTTP, so the UI can be previewed without a TV.

const SERVICE = 'luna://pl.prywatny.dziennik.service';
const TIMEOUT_MS = 120000;
const pending = new Set(); // bridges must stay referenced until they answer

function serviceError(res) {
  const error = new Error(res.errorText || 'Usługa aplikacji nie odpowiada.');
  error.code = res.errorCode || 'error';
  return error;
}

function luna(method, params) {
  return new Promise((resolve, reject) => {
    const Bridge = window.WebOSServiceBridge || window.PalmServiceBridge;
    const bridge = new Bridge();
    pending.add(bridge);
    const timer = setTimeout(() => {
      pending.delete(bridge);
      reject(Object.assign(new Error('Przekroczono czas oczekiwania na Librusa.'), { code: 'timeout' }));
    }, TIMEOUT_MS);
    bridge.onservicecallback = (message) => {
      clearTimeout(timer);
      pending.delete(bridge);
      let res;
      try {
        res = JSON.parse(message);
      } catch (e) {
        reject(Object.assign(new Error('Nieczytelna odpowiedź usługi.'), { code: 'invalidResponse' }));
        return;
      }
      if (res.returnValue) resolve(res);
      else reject(serviceError(res));
    };
    bridge.call(`${SERVICE}/${method}`, JSON.stringify(params || {}));
  });
}

async function http(method, params) {
  let response;
  try {
    response = await fetch(`/luna/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
  } catch (e) {
    throw Object.assign(new Error('Brak połączenia z serwerem deweloperskim.'), { code: 'network' });
  }
  const res = await response.json();
  if (res.returnValue) return res;
  throw serviceError(res);
}

export const onTV = !!(window.WebOSServiceBridge || window.PalmServiceBridge);

export function call(method, params) {
  return onTV ? luna(method, params) : http(method, params);
}
