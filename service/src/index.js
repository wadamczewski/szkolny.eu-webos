'use strict';

// webOS JS service: luna://pl.prywatny.dziennik.service/<method>. Bundled with the core by
// tools/build.mjs; `webos-service` is provided by the TV.

const Service = require('webos-service');
const client = require('../../core/client');

const SERVICE_ID = 'pl.prywatny.dziennik.service';
const service = new Service(SERVICE_ID);
let counter = 0;

function register(name, handler) {
  service.register(name, (message) => {
    // An activity keeps the service alive while the requests to Librus are running;
    // otherwise webOS may stop an idle-looking service in the middle of a sync.
    let activity = null;
    try {
      service.activityManager.create(`dziennik-${name}-${++counter}`, (a) => {
        activity = a;
      });
    } catch (e) {
      activity = null;
    }
    const done = () => {
      if (!activity) return;
      try {
        service.activityManager.complete(activity, () => {});
      } catch (e) {
        // Nothing to clean up.
      }
    };
    Promise.resolve()
      .then(() => handler(message.payload || {}))
      .then((result) => message.respond(Object.assign({ returnValue: true }, result)))
      .catch((error) =>
        message.respond({
          returnValue: false,
          errorCode: (error && error.code) || 'error',
          errorText: (error && error.message) || String(error),
        })
      )
      .then(done, done);
  });
}

register('login', client.login);
register('sync', client.sync);
register('timetable', client.timetable);
register('messages', client.messages);
register('message', client.message);
register('ping', () => ({ version: '1.0.0', node: process.version }));
