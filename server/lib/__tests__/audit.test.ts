import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { auditLog } from '../audit';
import { log } from '../logger';

describe('auditLog', () => {
  // spyOn without mockImplementation — calls through to real log.info
  const infoSpy = spyOn(log, 'info');

  afterEach(() => {
    infoSpy.mockClear();
  });

  test('calls log.info with structured audit payload', () => {
    auditLog('user.create', 'user-123', { role: 'admin' }, 'req-456');
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      {
        audit: true,
        action: 'user.create',
        userId: 'user-123',
        requestId: 'req-456',
        details: { role: 'admin' },
      },
      'Audit event',
    );
  });

  test('handles missing requestId', () => {
    auditLog('user.delete', 'user-789', { reason: 'inactive' });
    expect(infoSpy).toHaveBeenCalledWith(
      {
        audit: true,
        action: 'user.delete',
        userId: 'user-789',
        requestId: undefined,
        details: { reason: 'inactive' },
      },
      'Audit event',
    );
  });

  test('handles missing details and requestId', () => {
    auditLog('user.login', 'user-abc');
    expect(infoSpy).toHaveBeenCalledWith(
      {
        audit: true,
        action: 'user.login',
        userId: 'user-abc',
        requestId: undefined,
        details: undefined,
      },
      'Audit event',
    );
  });
});
