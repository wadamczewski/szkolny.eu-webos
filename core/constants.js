'use strict';

// Endpoints and user agents, the same as in the iOS app (LibrusConstants.swift), which took them
// from szkolny-android `data/api/Constants.kt` (GPL-3.0). Synergia login goes through the website
// form because api.librus.pl/OAuth/Token no longer accepts the password grant.
module.exports = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LibrusMobileApp',
  webUserAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',

  // Synergia website login (login + password), as in librus-apix
  apiOAuthURL: 'https://api.librus.pl/OAuth',
  synergiaWebClientID: '46',
  gatewayAPIURL: 'https://synergia.librus.pl/gateway/api/2.0',

  // Synergia website (messages)
  synergiaURL: 'https://synergia.librus.pl',

  // A Synergia session is renewed with a full login after this time, like on iOS.
  sessionLifetimeMs: 30 * 60 * 1000,
};
