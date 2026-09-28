import {test,expect} from 'bun:test';
import {calendarError} from '../src/calendar/errors';
test('OAuth failures distinguish reconnect, partial consent and publisher errors',()=>{
 expect(calendarError('Google access expired or was revoked. Reconnect your account.')).toMatch(/Reconnect|заново/);
 expect(calendarError('Missing Google permissions.')).toContain('ICS');
 expect(calendarError('Google rejected the publisher configuration.')).toMatch(/developer|разработчик/);
 expect(calendarError('Calendar service HTTP 429')).toMatch(/later|позже/);
 expect(calendarError('Calendar service HTTP 503')).toMatch(/later|позже/);
});
