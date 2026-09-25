# Dinox Desktop 4.1.0

## Что нового

- **Быстрый поиск:** приложения, файлы из индекса Windows, команды, калькулятор и поиск в Google, Яндексе или Bing. Открывается отдельной строкой поверх рабочего стола.
- **Свой хоткей:** Настройки → Основные → Поиск Dinox. Можно записать сочетание клавиш; занятое сочетание отмечается ошибкой и доступна повторная проверка. Настройки PowerToys и других программ автоматически не меняются.
- **Микшер:** отдельная громкость и отключение звука приложений, выбор устройства вывода и его громкость.
- **Редактор рабочего стола:** предпросмотр острова и дока, расположение индикаторов, дата, размеры и видимость. Изменения можно сохранить или отменить.
- **Календарь:** события на весь день и длительные события отображаются полосами над сеткой часов. Многодневное событие больше не повторяется огромной карточкой в каждом дне. Пересечения распределяются по строкам; дополнительные события можно раскрыть.
- Исправлены диапазоны дат, исключительная конечная дата событий на весь день и переходящие через границы недели события. Длительные проекты не вытесняют ближайшие встречи из виджета.
- В режиме месяца убрана мешающая правая полоса прокрутки; колесо над календарной сеткой переключает месяцы без прокрутки всей панели.

## English

- Floating search for apps, Windows-indexed filenames, commands, calculations and explicit web searches.
- Custom search shortcuts with conflict reporting and retry, configured in Settings → General → Dinox search.
- Per-application audio volume/mute and output-device selection.
- Desktop layout preview with Save/Cancel for island indicators and dock appearance.
- All-day and long events rendered as spanning bands above the week timeline, with overlap lanes, continuation markers and expandable overflow.
- Correct date ranges and month-wheel navigation without scrolling the entire calendar panel.

## Installation and updates

Download **Dinox-Desktop_4.1.0_x64-setup.exe** below. Existing Dinox installations can check for updates in **Settings → About**. Updates are offered by default; automatic installation at startup is optional. The updater verifies a cryptographic signature before installation. This is separate from Windows publisher/Authenticode signing.

Windows 11 x64 is the primary target. Calendar subscriptions remain read-only, including Google and Yandex ICS feeds. File search uses the Windows index. The mixer does not yet route individual apps to different outputs. Notification capture still requires package identity and Windows permission; Telegram's independent custom popups are not Windows notifications. Device compatibility and battery-life measurements remain limited. See the README and [desktop tools guide](https://github.com/JapanDino/Dinox-Desktop/blob/v4.1.0/docs/DESKTOP-TOOLS.md).
