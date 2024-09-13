const Storage = require('Storage');
const Sched = require('sched');
const Time_utils = require('time_utils');


// Data models //

class PrimitiveTimer {
  constructor(origin, is_running, rate, name) {
    this.origin = origin || 0;
    // default rate +1 unit per 1000 ms, countup
    this.rate = rate || 0.001;
    this.name = name || '';

    this._start_time = Date.now();
    this._pause_time = is_running ? null : this._start_time;
  }

  display_name() {
    return this.name ? this.name : this.provisional_name();
  }

  provisional_name() {
    return (this.rate >= 0 ? 'U' : 'D')
      + ' '
      + Time_utils.formatDuration(this.origin / this.rate);
  }

  display_status() {
    let status = '';

    // Indicate timer expired if its current value is <= 0 and it's
    // a countdown timer
    if (this.get() <= 0 && this.rate < 0) {
      status += '!';
    }

    if (this.is_running()) {
      status += '>';
    }

    return status;
  }

  is_running() {
    return !this._pause_time;
  }

  start() {
    if (!this.is_running()) {
      this._start_time += Date.now() - this._pause_time;
      this._pause_time = null;
    }
  }

  pause() {
    if (this.is_running()) {
      this._pause_time = Date.now();
    }
  }

  reset() {
    this.set(this.origin);
  }

  get() {
    const now = Date.now();
    const elapsed =
          (now - this._start_time)
          - (this.is_running() ? 0 : (now - this._pause_time));
    return this.origin + (this.rate * elapsed);
  }

  set(new_value) {
    const now = Date.now();
    this._start_time = (now - new_value / this.rate)
      + (this.origin / this.rate);
    if (!this.is_running()) {
      this._pause_time = now;
    }
  }

  dump() {
    return {
      cls: 'PrimitiveTimer',
      version: 0,
      origin: this.origin,
      rate: this.rate,
      name: this.name,
      start_time: this._start_time,
      pause_time: this._pause_time
    };
  }

  static load(data) {
    if (!(data.cls == 'PrimitiveTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading PrimitiveTimer state');
    }
    loaded = new this(data.origin, false, data.rate, data.name);
    loaded._start_time = data.start_time;
    loaded._pause_time = data.pause_time;
    return loaded;
  }
}


class TriangleTimer extends PrimitiveTimer {
  constructor(origin, is_running, rate, name, increment) {
    super(origin, is_running, rate, name);
    this.increment = increment || 1;

    this.end_alarm = false;
    this.outer_alarm = false;
    this.outer_action = 'Cont';
    this.pause_checkpoint = null;
  }

  provisional_name() {
    const origin_as_tri = as_triangle(
      this.origin,
      this.increment
    );
    return (this.rate >= 0 ? 'U' : 'D')
      + ' '
      + origin_as_tri[0] + '/' + origin_as_tri[1]
      + ' x' + this.increment;
  }

  start() {
    super.start();
    this.emit('status');
  }

  pause() {
    super.pause();
    this.emit('status');
  }

  _check_auto_pause() {
    const current_time = super.get();

    if (this.outer_action == 'Pause') {
      if (this.pause_checkpoint === null) {
        this.pause_checkpoint = current_time
          + this._time_to_next_outer_event() * this.rate;
        console.debug('timer auto-pause setup: ' + this.pause_checkpoint);
      } else if (
        (this.rate >= 0 && current_time >= this.pause_checkpoint)
        || (this.rate < 0 && current_time <= this.pause_checkpoint)
      ) {
        console.debug('timer auto-pause triggered');
        this.pause();
        this.set(this.pause_checkpoint);
        this.pause_checkpoint = null;
      }
    }
  }

  get() {
    this._check_auto_pause();
    return super.get();
  }

  time_to_next_alarm() {
    this._check_auto_pause();

    if (!this.is_running())
      return null;

    if (this.outer_alarm) {
      return this._time_to_next_outer_event();
    }

    if (this.end_alarm
        && this.rate <= 0
        && this.get() > 0) {
      return this.get() / Math.abs(this.rate);
    }

    return null;
  }

  _time_to_next_outer_event() {
    const as_tri = as_triangle(super.get(), this.increment);
    let inner_left = this.rate > 0 ? as_tri[0] - as_tri[1] : as_tri[1];
    // Avoid getting stuck if we're paused precisely on the event time
    if (!inner_left) {
      inner_left = as_tri[0] + Math.sign(this.rate) * this.increment;
    }
    console.log(as_tri[0], as_tri[1], inner_left);
    return Math.max(0, inner_left / Math.abs(this.rate));
  }

  dump() {
    data = super.dump();
    data.cls = 'TriangleTimer';
    data.increment = this.increment;
    data.end_alarm = this.end_alarm;
    data.outer_alarm = this.outer_alarm;
    data.outer_action = this.outer_action;
    data.pause_checkpoint = this.pause_checkpoint;
    return data;
  }

  static load(data) {
    if (!(data.cls == 'TriangleTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading TriangleTimer state');
    }
    let loaded = new this(
      data.origin, false, data.rate, data.name, data.increment);
    loaded._start_time = data.start_time;
    loaded._pause_time = data.pause_time;
    loaded.end_alarm = data.end_alarm;
    loaded.outer_alarm = data.outer_alarm;
    loaded.outer_action = data.outer_action;
    loaded.pause_checkpoint = data.pause_checkpoint;
    return loaded;
  }
}


function fixed_ceil(value) {
  // JavaScript sucks balls
  return Math.ceil(Math.round(value * 1e10) / 1e10);
}

function as_triangle(linear_time, increment) {
  if (increment === undefined) increment = 1;
  linear_time = linear_time / increment;
  const outer = fixed_ceil((Math.sqrt(linear_time * 8 + 1) - 1) / 2);
  const inner = outer - (outer * (outer + 1) / 2 - linear_time);
  return [outer * increment, inner * increment];
}


function as_linear(triangle_time, increment) {
  if (increment === undefined) increment = 1;
  const outer = triangle_time[0], inner = triangle_time[1];
  return (outer + (outer - 1) % increment + 1)
    * fixed_ceil(outer / increment) / 2
    - outer + inner;
}


// Persistent state //

const TIMERS_FILENAME = 'triangletimer.timers.json';
const SETTINGS_FILENAME = 'triangletimer.json';

const SCHEDULED_SAVE_TIMEOUT = 15000;

var SAVE_TIMERS_TIMEOUT = null;
var SAVE_SETTINGS_TIMEOUT = null;


function load_timers() {
  console.log('loading timers');
  let timers = Storage.readJSON(TIMERS_FILENAME, true) || [];
  if (timers.length) {
    // Deserealize timer objects
    timers = timers.map(t => TriangleTimer.load(t));
  } else {
    timers = [new TriangleTimer()];
  }
  return timers;
}

function save_timers() {
  console.log('saving timers');
  const dumped_timers = TIMERS.map(t => t.dump());
  if (!Storage.writeJSON(TIMERS_FILENAME, dumped_timers)) {
    E.showAlert('Trouble saving timers');
  }
}

function schedule_save_timers() {
  if (SAVE_TIMERS_TIMEOUT === null) {
    console.log('scheduling timer save');
    SAVE_TIMERS_TIMEOUT = setTimeout(() => {
      save_timers();
      SAVE_TIMERS_TIMEOUT = null;
    }, SCHEDULED_SAVE_TIMEOUT);
  } else {
    console.log('timer save already scheduled');
  }
}

function save_settings() {
  console.log('saving settings');
  if (!Storage.writeJSON(SETTINGS_FILENAME, SETTINGS)) {
    E.showAlert('Trouble saving settings');
  }
}

function schedule_save_settings() {
  if (SAVE_SETTINGS_TIMEOUT === null) {
    console.log('scheduling settings save');
    SAVE_SETTINGS_TIMEOUT = setTimeout(() => {
      save_settings();
      SAVE_SETTINGS_TIMEOUT = null;
    }, SCHEDULED_SAVE_TIMEOUT);
  } else {
    console.log('settings save already scheduled');
  }
}

const SETTINGS = Object.assign({
// Global settings go here
//  'last_viewed_timer': 0,
}, Storage.readJSON(SETTINGS_FILENAME, true) || {});

var TIMERS = load_timers();

const ACTIONS = [
  'Cont',
  'Pause',
];


// Persistent data convenience functions

function delete_tri_timer(timers, tri_timer) {
  const idx = timers.indexOf(tri_timer);
  if (idx !== -1) {
    timers.splice(idx, 1);
  } else {
    console.warn('delete_tri_timer: Bug? Tried to delete a timer not in list');
  }
  // Return another timer to switch UI to after deleting the focused
  // one
  return timers[Math.min(idx, timers.length - 1)];
}

function add_tri_timer(timers, tri_timer) {
  // Create a copy of current timer object
  const new_timer = TriangleTimer.load(tri_timer.dump());
  timers.unshift(new_timer);
  return new_timer;
}

function set_last_viewed_timer(tri_timer) {
  const idx = TIMERS.indexOf(tri_timer);
  if (idx == -1) {
    console.warn('set_last_viewed_timer: Bug? Called with a timer not found in list');
  } else if (idx == 0) {
    console.debug('set_last_viewed_timer: Already set as last timer');
  } else {
    // Move tri_timer to top of list
    TIMERS.splice(idx, 1);
    TIMERS.unshift(tri_timer);
    set_timers_dirty();
  }
}

function set_timers_dirty() {
  update_system_alarms();
  schedule_save_timers();
}

function set_settings_dirty() {
  schedule_save_settings();
}


// Alarm handling //

function delete_system_alarms() {
  var alarms = Sched.getAlarms().filter(a => a.appid == 'triangletimer');
  for (let alarm of alarms) {
    console.debug('delete sched alarm ' + alarm.id);
    Sched.setAlarm(alarm.id, undefined);
  }
  Sched.reload();
}

function set_system_alarms() {
  for (idx = 0; idx < TIMERS.length; idx++) {
    let timer = TIMERS[idx];
    let time_to_next_alarm = timer.time_to_next_alarm();
    if (time_to_next_alarm !== null) {
      console.debug('set sched alarm ' + idx + ' (' + time_to_next_alarm/1000 + ')');
      Sched.setAlarm(idx.toString(), {
        appid: 'triangletimer',
        timer: time_to_next_alarm,
        msg: timer.display_name(),
        js: "load('triangletimer.alarm.js');",
        data: { idx: idx },
        del: true,
      });
    }
  }
  Sched.reload();
}

function update_system_alarms() {
  delete_system_alarms();
  set_system_alarms();
}


E.on('kill', () => { save_timers(); });
E.on('kill', () => { save_settings(); });


exports = {TIMERS, SETTINGS, ACTIONS,
           load_timers, save_timers, schedule_save_timers, save_settings, schedule_save_settings,
           PrimitiveTimer, TriangleTimer,
           as_triangle, as_linear,
           delete_tri_timer, add_tri_timer, set_last_viewed_timer, set_timers_dirty, set_settings_dirty,
           update_system_alarms};
