'use strict';

// Port of LibrusError.swift. `code` travels over the luna bus, `message` is shown to the user.
const MESSAGES = {
  network: (m) => `Błąd połączenia: ${m}`,
  invalidResponse: (m) => `Nieprawidłowa odpowiedź serwera: ${m}`,
  invalidLogin: () => 'Nieprawidłowy login lub hasło.',
  tokenExpired: () => 'Sesja wygasła. Odśwież dane.',
  maintenance: () => 'Librus ma przerwę techniczną. Spróbuj później.',
  accessDenied: (m) => `Brak dostępu: ${m}`,
  timetableNotPublic: () => 'Plan lekcji ucznia nie jest publiczny.',
  featureNotActive: (m) => `Funkcja nieaktywna w szkole: ${m}`,
  api: (m) => `Błąd API Librus (${m})`,
  synergiaSession: (m) => `Nie udało się zalogować do Synergii: ${m}`,
  parse: (m) => `Nie udało się odczytać danych: ${m}`,
  notLoggedIn: () => 'Nie jesteś zalogowany.',
  badRequest: (m) => `Błędne wywołanie: ${m}`,
};

class LibrusError extends Error {
  constructor(code, detail) {
    const format = MESSAGES[code] || ((m) => m || code);
    super(format(detail));
    this.code = code;
    this.detail = detail;
  }
}

module.exports = { LibrusError };
