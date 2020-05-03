import http from 'http';

import type { testing } from '@testmate/testing';

interface Session {
  readonly sessionId: string;
  testResult: {[name: string]: testing.TestResult};
}

const sessions: {[sessionId: string]: Session | undefined} = {};

export function getSession(req: http.IncomingMessage): Session {
  // NOTE(Jae): 2020-04-28
  // Compute an id based on the "session". We should look at making this more
  // unique / less collision likely in the future.
  // - IP
  // - User Agent
  // - [???] Add special cookie header?
  const ip = getIPAddress(req);
  const userAgent = req.headers['user-agent']
  const sessionId = ip+'_'+userAgent

  let session = sessions[sessionId];
  if (session === undefined) {
    const newSession: Session = {
      sessionId: sessionId,
      testResult: {},
    }
    sessions[sessionId] = newSession;
    return newSession;
  }
  return session;
}

function getIPAddress(req: http.IncomingMessage): string {
  // TODO(Jae): 2020-04-28
  // Maybe add an option to trust proxy IP addresses? For those
  // behind CloudFlare.
  // I can't imagine a real use-case yet so not implementing.
  /*const trustProxy = false;
  if (trustProxy) {
    const proxyHeader = req.headers['x-forwarded-for'];
    if (proxyHeader === undefined) {
      throw new Error('Unable to get proxy IP.')
    }
    if (typeof proxyHeader === 'string') {
      let splitAllowedAddresses = proxyHeader.split(',');
      return splitAllowedAddresses[splitAllowedAddresses.length-1];
    }
    return proxyHeader[proxyHeader.length-1];
  }*/

  // Get IP address
  let ip: string | undefined = req.connection.remoteAddress;
  if (!ip) {
    ip = req.socket.remoteAddress;
  }
  if (!ip) {
    ip = '';
  }
  return ip;
}