const tt = require('triangletimer');

function showAlarm(alarm) {
  const settings = require("sched").getSettings();
  const tri_timer = tt.TIMERS[alarm.data.idx];

  Bangle.loadWidgets();
  Bangle.drawWidgets();

  // buzzCount should really be called buzzRepeat, so subtract 1
  let buzzCount = tri_timer.buzz_count - 1;

  tt.update_system_alarms();
  const message =  tt.format_triangle(tri_timer) + '\n' + alarm.msg;

  function doAlarmAction(action) {
    buzzCount = 0;

    Bangle.emit("alarmDismiss", alarm);

    if (action === 'goto') {
      console.log('alarm ' + alarm.data.idx);
      tt.set_last_viewed_timer(tri_timer);
      load('triangletimer.app.js');
    } else if (action === 'ok') {
      if (isAutoPause) {
        Bangle.showLoadingScreen();
        tri_timer.start();
        tt.update_system_alarms();
      }
      load();
    }
  };

  const isAutoPause = tri_timer.outer_action === 'Pause';
  const buttons = { Goto: 'goto', };
  buttons[isAutoPause ? 'Next' : 'OK'] = 'ok';
  E.showPrompt(message, {
    title: 'Triangle timer',
    buttons: buttons,
    back: () => doAlarmAction('ok'),
  }).then(doAlarmAction);

  function buzz() {
    if (settings.unlockAtBuzz) {
      Bangle.setLocked(false);
    }

    const pattern = tri_timer.vibrate_pattern || settings.defaultTimerPattern;
    console.log('buzz: ' + pattern);
    console.log('buzzCount: ' + buzzCount);
    require("buzz").pattern(pattern).then(() => {
      if (buzzCount == null || buzzCount--) {
        setTimeout(buzz, settings.buzzIntervalMillis);
      } else if (alarm.as) { // auto-snooze
        // buzzCount should really be called buzzRepeat, so subtract 1
        buzzCount = tri_timer.buzz_count - 1;
        setTimeout(buzz, settings.defaultSnoozeMillis);
      }
    });
  }

  if ((require("Storage").readJSON("setting.json", 1) || {}).quiet > 1)
    return;

  buzz();
}


let alarms = require("sched").getAlarms();
let activeAlarm = require("sched").getActiveAlarms(alarms).find(
  alarm => alarm.appid === 'triangletimer'
);

if (activeAlarm !== undefined) {
  showAlarm(activeAlarm);
} else {
  setTimeout(load, 100);
}
