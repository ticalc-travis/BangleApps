const Storage = require('Storage');
const Sched = require('sched');


// Data models //

class PrimitiveTimer {
  constructor(origin, rate, is_running) {
    this.origin = origin;
    this.rate = rate;

    this._start_time = Date.now();
    this._pause_time = is_running ? null : this._start_time;
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
      start_time: this._start_time,
      pause_time: this._pause_time
    };
  }

  static load(data) {
    if (!(data.cls == 'PrimitiveTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading PrimitiveTimer state');
    }
    loaded = new this(data.origin, data.rate, false);
    loaded._start_time = data.start_time;
    loaded._pause_time = data.pause_time;
    return loaded;
  }
}


class TriangleTimer {
  constructor(name, primitive_timer, increment) {
    this.name = name;
    this.timer = primitive_timer;
    if (increment === undefined) increment = 1;
    this.increment = increment;

    this.end_alarm = false;
    this.outer_alarm = false;
    this.outer_action = 'Cont';
    this.pause_checkpoint = null;
  }

  display_name() {
    if (this.name) {
      return this.name;
    } else {
      return this.provisional_name();
    }
  }

  provisional_name() {
    const origin_as_tri = as_triangle(
      this.timer.origin,
      this.increment
    );
    return (this.timer.rate >= 0 ? 'U' : 'D')
      + ' '
      + origin_as_tri[0] + '/' + origin_as_tri[1]
      + ' x' + this.increment;
  }

  display_status() {
    let status = '';

    // Indicate timer expired if its current value is <= 0 and it's
    // a countdown timer
    if (this.get() <= 0 && this.timer.rate < 0) {
      status += '!';
    }

    if (this.timer.is_running()) {
      status += '>';
    }

    return status;
  }

  get() {
    if (this.outer_action == 'Pause') {
      if (this.pause_checkpoint === null) {
        this.pause_checkpoint = this.timer.get()
          + this.time_to_next_outer_event() * this.timer.rate;
        console.debug('timer auto-pause setup: ' + this.pause_checkpoint);
      } else if (
        (this.timer.rate >= 0 && this.timer.get() >= this.pause_checkpoint)
        || (this.timer.rate < 0 && this.timer.get() <= this.pause_checkpoint)
      ) {
        console.debug('timer auto-pause triggered');
        this.timer.pause();
        this.timer.set(this.pause_checkpoint);
        this.pause_checkpoint = null;
      }
    }
    return this.timer.get();
  }

  set(value) {
    return this.timer.set(value);
  }

  time_to_next_alarm() {
    if (!this.timer.is_running())
      return null;

    if (this.outer_alarm) {
      return this.time_to_next_outer_event();
    }

    if (this.end_alarm
        && this.timer.rate <= 0
        && this.get() > 0) {
      return this.get() / Math.abs(this.timer.rate);
    }

    return null;
  }

  time_to_next_outer_event() {
    const as_tri = as_triangle(this.timer.get(), this.increment);
    let inner_left = this.timer.rate > 0 ? as_tri[0] - as_tri[1] : as_tri[1];
    // Avoid getting stuck if we're paused precisely on the event time
    if (!inner_left) {
      inner_left = as_tri[0] + Math.sign(this.timer.rate) * this.increment;
    }
    console.log(as_tri[0], as_tri[1], inner_left);
    return Math.max(0, inner_left / Math.abs(this.timer.rate));
  }

  dump() {
    return {
      cls: 'TriangleTimer',
      version: 0,
      name: this.name,
      timer: this.timer.dump(),
      increment: this.increment,
      end_alarm: this.end_alarm,
      outer_alarm: this.outer_alarm,
      outer_action: this.outer_action,
      pause_checkpoint: this.pause_checkpoint,
    };
  }

  static load(data) {
    if (!(data.cls == 'TriangleTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading TriangleTimer state');
    }
    let new_timer = new this(
      data.name,
      PrimitiveTimer.load(data.timer),
      data.increment);
    new_timer.end_alarm = data.end_alarm;
    new_timer.outer_alarm = data.outer_alarm;
    new_timer.outer_action = data.outer_action;
    new_timer.pause_checkpoint = data.pause_checkpoint;
    return new_timer;
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
    // New configuration with one defined default timer
    timers = [
      new TriangleTimer(
        '', new PrimitiveTimer(0, 0.001, false), 1
      )
    ];
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
