import {tx} from '../desktopText';
export function calendarError(error:unknown):string{
 const value=String(error).replace(/^Error:\s*/,'');
 if(/uncertain|Previous creation/i.test(value))return tx('Не удалось подтвердить результат. Проверьте исходный календарь перед повторным созданием.','The result could not be confirmed. Check the original calendar before creating another copy.');
 if(/cancelled/i.test(value))return tx('Вход отменён.','Sign-in cancelled.');
 if(/timed out/i.test(value))return tx('Время ожидания входа истекло. Попробуйте ещё раз.','Sign-in timed out. Try again.');
 if(/not configured|not enabled by the publisher/i.test(value))return tx('Вход ещё не активирован разработчиком в этой сборке. Подписки ICS доступны.','Sign-in has not been enabled by the publisher in this build. ICS subscriptions remain available.');
 if(/missing Google permissions/i.test(value))return tx('Разрешены не все необходимые действия. Подключите Google заново и разрешите список календарей, события и задачи. Подписки ICS работают без этого доступа.','Some required permissions were not granted. Reconnect Google and allow calendar lists, events and tasks. ICS subscriptions work without this access.');
 if(/publisher configuration/i.test(value))return tx('Google отклонил настройки входа этой сборки. Обновите Dinox или сообщите разработчику.','Google rejected this build’s sign-in configuration. Update Dinox or contact the developer.');
 if(/429|HTTP 5\d\d/i.test(value))return tx('Сервис временно недоступен или ограничил частоту запросов. Сохранённые записи доступны; повторите позже.','The service is temporarily unavailable or rate limited. Cached entries remain available; try again later.');
 if(/401|expired|reconnect|denied sign-in|declined/i.test(value))return tx('Нет действующего разрешения. Подключите аккаунт заново и разрешите доступ к календарям и задачам.','No valid permission. Reconnect the account and allow calendar and task access.');
 if(/403|permissions|writable|read-only/i.test(value))return tx('Нет доступа на изменение. Проверьте разрешения аккаунта или выберите другой календарь.','Write access is unavailable. Check account permissions or choose another calendar.');
 if(/offline|connection|Response interrupted/i.test(value))return tx('Не удалось связаться с сервисом. Сохранённые записи доступны; попробуйте обновить позже.','Could not reach the service. Cached entries remain available; try refreshing later.');
 if(/Sign-in already/i.test(value))return tx('Подключение уже выполняется. Завершите или отмените его.','Sign-in is already in progress. Finish or cancel it first.');
 if(/HTTP 412/i.test(value))return tx('Задача изменилась в другом приложении. Обновите список перед повторной попыткой.','The task changed in another app. Refresh before trying again.');
 if(/Maximum 8/i.test(value))return tx('Можно подключить до 8 аккаунтов.','You can connect up to 8 accounts.');
 return value;
}
