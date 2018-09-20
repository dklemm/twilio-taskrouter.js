import EnvTwilio from '../../util/EnvTwilio';
import Worker from '../../../lib/Worker';
import * as assert from 'assert';

const chai = require('chai');
chai.use(require('sinon-chai'));
chai.should();
const credentials = require('../../env');
const JWT = require('../../util/MakeAccessToken');

describe('Task Transfer', function() {
  /* eslint-disable no-invalid-this */
  this.timeout(5000);
  /* eslint-enable */

  const envTwilio = new EnvTwilio(credentials.accountSid, credentials.authToken, credentials.env);
  const aliceToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid);
  const bobToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid);

  let alice;
  let bob;
  let reservation;
  before(() => {
    return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
      alice = new Worker(aliceToken, {
        ebServer: `${credentials.ebServer}/v1/wschannels`,
        wsServer: `${credentials.wsServer}/v1/wschannels`,
        logLevel: 'error',
      });

      bob = new Worker(bobToken, {
        ebServer: `${credentials.ebServer}/v1/wschannels`,
        wsServer: `${credentials.wsServer}/v1/wschannels`,
        logLevel: 'error',
      });

      const createTask = envTwilio.updateWorkerCapacity(credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid, 'default', 1)
        .then(() => envTwilio.updateWorkerCapacity(credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid, 'default', 1))
        .then(() => envTwilio.updateWorkerActivity(credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid, credentials.multiTaskConnectActivitySid))
        .then(() => envTwilio.updateWorkerActivity(credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid, credentials.multiTaskUpdateActivitySid))
        .then(() => envTwilio.createTask(credentials.multiTaskWorkspaceSid, credentials.multiTaskWorkflowSid, JSON.stringify({
          to: 'client:alice',
          conference: { sid: 'CF11111111111111111111111111111111' }
        })));

      return Promise.all([
        new Promise(resolve => alice.on('ready', () => resolve())),
        new Promise(resolve => bob.on('ready', () => resolve())),
      ]).then(() => envTwilio.updateWorkerActivity(credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid, credentials.multiTaskConnectActivitySid))
        .then(createTask)
        .then(() => {
          reservation = Array.from(alice.reservations.values())[0];
          return reservation.accept();
        });
    });
  });

  after(() => {
    alice.removeAllListeners();
    bob.removeAllListeners();
    return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid)
      .then(envTwilio.updateWorkerActivity(
        credentials.multiTaskWorkspaceSid,
        credentials.multiTaskAliceSid,
        credentials.multiTaskUpdateActivitySid
      )).then(envTwilio.updateWorkerActivity(
        credentials.multiTaskWorkspaceSid,
        credentials.multiTaskBobSid,
        credentials.multiTaskUpdateActivitySid
      ));
  });

  it('should get a 200, resolve and emit a transfer-initiated event if all goes well', () => {
    return Promise.all([
      reservation.task.transfer(credentials.multiTaskBobSid),
      new Promise(resolve => { reservation.task.on('transferInitiated', () => resolve()); }),
    ]);
  });

  it('should create a Reservation containing a .transfer object for Bob', (done) => {
    bob.on('reservationCreated', () => {
      reservation = Array.from(bob.reservations.values())[0];
      assert.equal(reservation.transfer.mode, 'WARM');
      done();
    });
  });
});
