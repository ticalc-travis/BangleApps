const Layout = require('Layout');
const Storage = require('Storage');


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
    if (this.timer.get() <= 0 && this.timer.rate < 0) {
      status += '!';
    }

    if (this.timer.is_running()) {
      status += '>';
    }

    return status;
  }

  dump() {
    return {
      cls: 'TriangleTimer',
      version: 0,
      name: this.name,
      timer: this.timer.dump(),
      increment: this.increment
    };
  }

  static load(data) {
    if (!(data.cls == 'TriangleTimer' && data.version == 0)) {
      console.error('Incompatible data type for loading TriangleTimer state');
    }
    return new this(data.name, PrimitiveTimer.load(data.timer), data.increment);
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


// UI //

class TimerView {
  constructor(tri_timer) {
    this.tri_timer = tri_timer;

    this.layout = null;
    this.listeners = {};
    this.timer_timeout = null;
  }

  start() {
    this._initLayout();
    this.layout.clear();
    this.render();
    set_last_viewed_timer(this.tri_timer);
  }

  stop() {
    if (this.timer_timeout !== null) {
      clearTimeout(this.timer_timeout);
      this.timer_timeout = null;
    }
    Bangle.setUI();
  }

  _initLayout() {
    const layout = new Layout(
      {
        type: 'v',
        bgCol: g.theme.bg,
        c: [
          {
            type: 'txt',
            id: 'row1',
            label: '88:88:88',
            font: 'Vector:35x56',
            fillx: 1,
          },
          {
            type: 'txt',
            id: 'row2',
            label: '88:88:88',
            font: 'Vector:35x42',
            fillx: 1,
          },
          {
            type: 'txt',
            id: 'row3',
            label: '88:88:88',
            font: '12x20',
            fillx: 1,
          },
          {
            type: 'h',
            id: 'buttons',
            c: [
              {type: 'btn', font: '6x8:2', fillx: 1, label: 'St/Pa', id: 'start_btn',
               cb: this.start_stop_timer.bind(this)},
              {type: 'btn', font: '6x8:2', fillx: 1, label: 'Menu', id: 'menu_btn',
               cb: () => {
                 switch_UI(new TimerViewMenu(this.tri_timer));
               }
              }
            ]
          }
        ]
      }
    );
    this.layout = layout;
  }

  render(item) {
    const timer = this.tri_timer.timer;
    console.debug('render called: ' + item);

    if (!item) {
      this.layout.update();
      this.layout.clear();
    }

    if (!item || item == 'timer') {

      let timer_as_linear = timer.get();
      if (timer_as_linear < 0) {
        // Handle countdown timer expiration
        timer_as_linear = 0;
        setTimeout(() => { this.render('status'); }, 0);
        setTimeout(() => { this.render('buttons'); }, 0);
      }
      const timer_as_tri = as_triangle(
        timer_as_linear, this.tri_timer.increment);

      let label = timer_as_tri[0];
      if (label != this.layout.row1.label) {
        this.layout.row1.label = label;
        this.layout.clear(this.layout.row1);
        this.layout.render(this.layout.row1);
      }

      label = timer_as_tri[1];
      if (label != this.layout.row2.label) {
        this.layout.row2.label = Math.ceil(timer_as_tri[1]);
        this.layout.clear(this.layout.row2);
        this.layout.render(this.layout.row2);
      }

    }

    if (!item || item == 'buttons') {
      this.layout.start_btn.label =
        timer.is_running() ? 'Pause' : 'Start';
      this.layout.render(this.layout.buttons);
    }

    if (!item || item == 'status') {
      const origin_as_tri = as_triangle(
        timer.origin,
        this.tri_timer.increment
      );
      this.layout.row3.label =
        this.tri_timer.display_status()
        + ' ' + this.tri_timer.provisional_name();
      this.layout.clear(this.layout.row3);
      this.layout.render(this.layout.row3);
    }

    if (this.timer_timeout === null
        && timer.is_running()
        && timer.get() > 0) {
      // Calculate approximate time next display update is needed.
      // The + 50 is a compensating factor due to timeouts
      // apparently sometimes triggering too early.
      let next_tick = timer.get() % 1;
      if (timer.rate > 0) {
        next_tick = 1 - next_tick;
      }
      next_tick = next_tick / Math.abs(timer.rate) + 50;

      this.timer_timeout = setTimeout(
        () => { this.timer_timeout = null; this.render('timer'); },
        next_tick
      );
    }
  }

  start_stop_timer() {
    if (this.tri_timer.timer.is_running()) {
      this.tri_timer.timer.pause();
    } else {
      this.tri_timer.timer.start();
    }
    this.render('buttons');
    this.render('status');
    this.render('timer');
    this.emit('dirty_timers');
  }
}


class TimerViewMenu {
  constructor(tri_timer) {
    this.tri_timer = tri_timer;
  }

  start() {
    this.top_menu();
  }

  stop() {
    E.showMenu();
  }

  back() {
    switch_UI(new TimerView(this.tri_timer));
  }

  top_menu() {
    top_menu = {
      '': {
        title: this.tri_timer.display_name(),
        back: this.back.bind(this)
      },
      'Reset': () => { E.showMenu(reset_menu); },
      'Timers': () => {
        switch_UI(new TimerMenu(TIMERS, this.tri_timer));
      },
      'Edit': this.edit_menu.bind(this),
      'Add': () => {
        this.emit('dirty_timers');
        const new_timer = add_tri_timer(this.tri_timer);
        const timer_view_menu = new TimerViewMenu(new_timer);
        timer_view_menu.edit_menu();
      },
      'Delete': () => { E.showMenu(delete_menu); },
    };
    if (TIMERS.length <= 1) {
      // Prevent user deleting last timer
      delete top_menu.Delete;
    }

    reset_menu = {
      '': {
        title: 'Confirm reset',
        back: () => { E.showMenu(top_menu); }
      },
      'Reset': () => {
        this.tri_timer.timer.reset();
        this.emit('dirty_timers');
        this.back();
      },
      'Cancel': () => { E.showMenu(top_menu); },
    };

    delete_menu = {
      '': {
        title: 'Confirm delete',
        back: () => { E.showMenu(top_menu); }
      },
      'Delete': () => {
        this.emit('dirty_timers');
        switch_UI(new TimerView(delete_tri_timer(this.tri_timer)));
      },
      'Cancel': () => { E.showMenu(top_menu); },
    };

    E.showMenu(top_menu);
  }

  edit_menu() {
    edit_menu = {
      '': {
        title: 'Edit: ' + this.tri_timer.display_name(),
        back: () => { this.top_menu(); },
      },
      'Direction': {
        value: this.tri_timer.timer.rate >= 0,
        format: v => (v ? 'Up' : 'Down'),
        onchange: v => {
          this.tri_timer.timer.rate = -this.tri_timer.timer.rate;
          this.emit('dirty_timers');
        }
      },
      'Start (Tri)': this.edit_start_tri_menu.bind(this),
      'Start (HMS)': this.edit_start_hms_menu.bind(this),
      'Increment': {
        value: this.tri_timer.increment,
        min: 1,
        max: 9999,
        step: 1,
        wrap: true,
        onchange: v => {
          this.tri_timer.increment = v;
          this.emit('dirty_timers');
        },
      }
    };

    E.showMenu(edit_menu);
  }

  edit_start_tri_menu() {
    let origin_tri = as_triangle(
      this.tri_timer.timer.origin, this.tri_timer.increment);

    edit_start_tri_menu = {
      '': {
        title: 'Start (Tri)',
        back: this.edit_menu.bind(this),
      },
      'Outer': {
        value: origin_tri[0],
        min: 0,
        max: Math.floor(9999 / this.tri_timer.increment)
          * this.tri_timer.increment,
        step: this.tri_timer.increment,
        wrap: true,
        noList: true,
        onchange: v => {
          origin_tri[0] = v;
          edit_start_tri_menu.Inner.max = origin_tri[0];
          origin_tri[1] = (this.tri_timer.timer.rate >= 0) ?
            1 : origin_tri[0];
          edit_start_tri_menu.Inner.value = origin_tri[1];
          this.tri_timer.timer.origin = as_linear(
            origin_tri, this.tri_timer.increment
          );
          this.emit('dirty_timers');
        }
      },
      'Inner': {
        value: origin_tri[1],
        min: 0,
        max: origin_tri[0],
        step: 1,
        wrap: true,
        noList: true,
        onchange: v => {
          origin_tri[1] = v;
          this.tri_timer.timer.origin = as_linear(
            origin_tri, this.tri_timer.increment
          );
          this.emit('dirty_timers');
        }
      },
    };

    E.showMenu(edit_start_tri_menu);
  }

  edit_start_hms_menu() {
    const timer = this.tri_timer.timer;
    let origin_hms = {
      h: Math.floor(timer.origin / 3600),
      m: Math.floor(timer.origin / 60) % 60,
      s: Math.floor(timer.origin % 60),
    };

    function update_origin() {
      timer.origin = origin_hms.h * 3600
        + origin_hms.m * 60
        + origin_hms.s;
    }

    edit_start_hms_menu = {
      '': {
        title: 'Start (HMS)',
        back: this.edit_menu.bind(this),
      },
      'Hours': {
        value: origin_hms.h,
        min: 0,
        max: 9999,
        wrap: true,
        onchange: v => {
          origin_hms.h = v;
          update_origin();
          this.emit('dirty_timers');
        }
      },
      'Minutes': {
        value: origin_hms.m,
        min: 0,
        max: 59,
        wrap: true,
        onchange: v => {
          origin_hms.m = v;
          update_origin();
          this.emit('dirty_timers');
        }
      },
      'Seconds': {
        value: origin_hms.s,
        min: 0,
        max: 59,
        wrap: true,
        onchange: v => {
          origin_hms.s = v;
          update_origin();
          this.emit('dirty_timers');
        }
      },
    };

    E.showMenu(edit_start_hms_menu);
  }
}


class TimerMenu {
  constructor(tri_timers, focused_timer) {
    this.tri_timers = tri_timers;
    this.focused_timer = focused_timer;
  }

  start() {
    this.top_menu();
  }

  stop() {
    E.showMenu();
  }

  back() {
    switch_UI(new TimerViewMenu(this.focused_timer));
  }

  top_menu() {
    let menu = {
      '': {
        title: "Timers",
        back: this.back.bind(this)
      }
    };
    this.tri_timers.forEach((tri_timer) => {
      menu[tri_timer.display_status() + ' ' + tri_timer.display_name()] =
        () => { switch_UI(new TimerView(tri_timer)); };
    });
    E.showMenu(menu);
  }
}


function switch_UI(new_UI) {
  if (CURRENT_UI) {
    CURRENT_UI.stop();
  }
  CURRENT_UI = new_UI;
  CURRENT_UI.on('dirty_timers', schedule_save_timers);
  CURRENT_UI.on('dirty_settings', schedule_save_settings);
  CURRENT_UI.start();
}


function delete_tri_timer(tri_timer) {
  const idx = TIMERS.indexOf(tri_timer);
  if (idx !== -1) {
    TIMERS.splice(idx, 1);
  } else {
    console.warn('delete_tri_timer: Tried to delete a timer not in list');
  }
  // Return another timer to switch UI to after deleting the focused
  // one
  return TIMERS[Math.min(idx, TIMERS.length - 1)];
}

function add_tri_timer(tri_timer) {
  // Create a copy of current timer object
  const new_timer = TriangleTimer.load(tri_timer.dump());
  new_timer.name = 'New';       // temp testing/debugging
  TIMERS.unshift(new_timer);
  return new_timer;
}


function set_last_viewed_timer(tri_timer) {
  const idx = TIMERS.indexOf(tri_timer);
  if (idx != -1) {
    // Move tri_timer to top of list
    TIMERS.splice(idx, 1);
    TIMERS.unshift(tri_timer);
    schedule_save_timers();
  } else {
    console.warn('Bug? `set_last_viewed_timer` called with a timer not found in list');
  }
}


// Persistent state //

const TIMERS_FILENAME = 'triangletimer.timers.json';
const SETTINGS_FILENAME = 'triangletimer.json';

const SCHEDULED_SAVE_TIMEOUT = 15000;

const SETTINGS = Object.assign({
// Global settings go here
//  'last_viewed_timer': 0,
}, Storage.readJSON(SETTINGS_FILENAME, true) || {});

var SAVE_TIMERS_TIMEOUT = null;
var SAVE_SETTINGS_TIMEOUT = null;

function load_timers() {
  console.log('loading timers');
  let timers = Storage.readJSON(TIMERS_FILENAME, true);
  if (timers) {
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

function save_timers(timers) {
  console.log('saving timers');
  timers = timers.map(t => t.dump());
  if (!Storage.writeJSON(TIMERS_FILENAME, timers)) {
    E.showAlert('Trouble saving timers');
  }
}

function schedule_save_timers() {
  if (SAVE_TIMERS_TIMEOUT === null) {
    console.log('scheduling timer save');
    SAVE_TIMERS_TIMEOUT = setTimeout(() => {
      save_timers(TIMERS);
      SAVE_TIMERS_TIMEOUT = null;
    }, SCHEDULED_SAVE_TIMEOUT);
  } else {
    console.log('timer save already scheduled');
  }
}

function save_settings(settings) {
  console.log('saving settings');
  if (!Storage.writeJSON(SETTINGS_FILENAME, settings)) {
    E.showAlert('Trouble saving settings');
  }
}

function schedule_save_settings() {
  if (SAVE_SETTINGS_TIMEOUT === null) {
    console.log('scheduling settings save');
    SAVE_SETTINGS_TIMEOUT = setTimeout(() => {
      save_settings(SETTINGS);
      SAVE_SETTINGS_TIMEOUT = null;
    }, SCHEDULED_SAVE_TIMEOUT);
  } else {
    console.log('settings save already scheduled');
  }
}


Bangle.loadWidgets();
Bangle.drawWidgets();

var TIMERS = load_timers();
var CURRENT_UI = null;

E.on('kill', () => { save_timers(TIMERS); });
E.on('kill', () => { save_settings(SETTINGS); });

switch_UI(new TimerView(TIMERS[0]));
