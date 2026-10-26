const Layout = require('Layout');

const tt = require('triangletimer');

// UI //

const MOVE_TO_TOP_TIMEOUT = 5000;
const DRAG_THRESHOLD = 50;

// Indicator arrow size in UI
const ARROW_BTN_SIZE = 15;


function draw_triangle(lay, flip) {
  // Render right-pointing triangle if `flip`, else left-pointing
  // triangle

  flip = flip ? lay.w : 0;
  g.setColor(g.theme.fg)
    .fillPoly([flip + lay.x, lay.y + lay.h / 2,
    lay.x + lay.w - flip, lay.y,
    lay.x + lay.w - flip, lay.y + lay.h]);
}

function update_status_widget(timer) {
  // Update the status widget with the current timer status. The
  // timer is passed as a parameter.

  function widget_draw() {
    // Draw a right-pointing arrow if the timer is running

    g.reset();
    if (WIDGETS.triangletimer.width > 1) {
      draw_triangle({
        x: WIDGETS.triangletimer.x,
        // Center the arrow vertically in the 24-pixel-height widget area
        y: WIDGETS.triangletimer.y + Math.floor((24 - ARROW_BTN_SIZE) / 2),
        w: ARROW_BTN_SIZE,
        h: ARROW_BTN_SIZE
      }, true);
    }
  }

  // For some reason, a width of 0 when there's nothing to display
  // doesn't work as expected, so we use 1 instead.
  let width = timer.is_running() ? ARROW_BTN_SIZE : 1;

  if (WIDGETS.triangletimer === undefined) {
    WIDGETS.triangletimer = {
      area: 'tr',
      draw: widget_draw,
    };
  }
  WIDGETS.triangletimer.width = width;
  Bangle.drawWidgets();
}


class TimerView {
  constructor(tri_timer) {
    this.tri_timer = tri_timer;

    this.layout = null;
    this.listeners = {};
    this.timer_timeout = null;
    this.to_top_timeout = null;
  }

  start() {
    this._initLayout();
    this.layout.clear();
    this.render();
    let render_status = () => { this.render(); };
    this.tri_timer.on('status', render_status);
    this.tri_timer.on('auto-pause', tt.set_timers_dirty);
    this.listeners.status = render_status;

    // Tap handler
    function tapHandler(button, xy) {
      // Check if the tap was in the area of the timer display
      if (xy.y < this.layout.buttons.y) {
        // Left half of display area: switch display modes; right half of display area: reset timer
        if (xy.x < this.layout.row1.x + this.layout.row1.w / 2) {
          Bangle.buzz(50, 0.5);
          tt.SETTINGS.view_mode = (tt.SETTINGS.view_mode + 1) % 4;
          tt.schedule_save_settings();
          setTimeout(this.render.bind(this), 0);
        } else {
          switch_UI(new ResetTimerMenu(
            this.tri_timer,
            () => { switch_UI(new TimerView(this.tri_timer)); }
          ));
        }
      }
    }
    this.listeners.tap = tapHandler.bind(this);
    Bangle.on('touch', this.listeners.tap);

    // Drag handler
    let distanceX = null;
    function dragHandler(ev) {
      if (ev.b) {
        distanceX = (distanceX === null ? 0 : distanceX) + ev.dx;
      } else {
        distanceX = null;
      }
      if (distanceX !== null && Math.abs(distanceX) > DRAG_THRESHOLD) {
        if (tt.TIMERS.length > 1) {
          Bangle.buzz(50, 0.5);
          let index = tt.TIMERS.indexOf(this.tri_timer) + Math.sign(distanceX);
          index = (index + tt.TIMERS.length) % tt.TIMERS.length;
          switch_UI(new TimerView(tt.TIMERS[index]));
        }
        distanceX = null;
      }
    }
    this.listeners.drag = dragHandler.bind(this);
    Bangle.on('drag', this.listeners.drag);

    this.to_top_timeout = setTimeout(
      tt.set_last_viewed_timer, MOVE_TO_TOP_TIMEOUT, this.tri_timer);

    // Physical button handler
    this.listeners.button = setWatch(
      this.start_stop_timer.bind(this),
      BTN,
      {edge: 'falling', debounce: 50, repeat: true}
    );
  }

  stop() {
    if (this.timer_timeout !== null) {
      clearTimeout(this.timer_timeout);
      this.timer_timeout = null;
    }
    if (this.to_top_timeout !== null) {
      clearTimeout(this.to_top_timeout);
      this.to_top_timeout = null;
    }
    this.tri_timer.removeListener('status', this.listeners.status);
    Bangle.removeListener('touch', this.listeners.tap);
    Bangle.removeListener('drag', this.listeners.drag);
    clearWatch(this.listeners.button);
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
            label: '8888',
            font: 'Vector:56x42',
            fillx: 1,
          },
          {
            type: 'txt',
            id: 'row2',
            label: '8888',
            font: 'Vector:56x56',
            fillx: 1,
          },
          {
            type: 'txt',
            id: 'row3',
            label: '',
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
    console.debug('render called: ' + item);
    this.tri_timer.check_auto_pause();

    if (!item) {
      this.layout.update();
    }

    if (!item || item == 'timer') {

      let timer_as_linear = this.tri_timer.get();
      if (timer_as_linear < 0) {
        // Handle countdown timer expiration
        timer_as_linear = 0;
        setTimeout(() => { this.render('status'); }, 0);
      }
      const timer_as_tri = tt.as_triangle(
        timer_as_linear, this.tri_timer.increment);

      var label1, label2, font1, font2;
      if (tt.SETTINGS.view_mode == 0) {
        label1 = timer_as_tri[0];
        label2 = Math.ceil(timer_as_tri[1]);
        font1 = 'Vector:56x42';
        font2 = 'Vector:56x56';
      } else if (tt.SETTINGS.view_mode == 1) {
        label1 = timer_as_tri[0];
        label2 = Math.ceil(timer_as_tri[0] - timer_as_tri[1]);
        font1 = 'Vector:56x42';
        font2 = 'Vector:56x56';
      } else if (tt.SETTINGS.view_mode == 2) {
        label1 = tt.format_triangle(this.tri_timer);
        let ttna = this.tri_timer.time_to_next_event();
        if (ttna !== null) {
          label2 = tt.format_duration(ttna, true);
        } else {
          label2 = '--:--:--';
        }
        font1 = 'Vector:30x42';
        font2 = 'Vector:34x56';
      } else if (tt.SETTINGS.view_mode == 3) {
        label1 = timer_as_tri[0];
        let ttna = this.tri_timer.time_to_next_event();
        if (ttna !== null) {
          label2 = tt.format_duration(ttna, false);
        } else {
          label2 = '--:--';
        }
        font1 = 'Vector:56x42';
        font2 = 'Vector:48x56';
      }

      if (label1 !== this.layout.row1.label) {
        this.layout.row1.label = label1;
        this.layout.row1.font = font1;
        this.layout.clear(this.layout.row1);
        this.layout.render(this.layout.row1);
      }

      if (label2 !== this.layout.row2.label) {
        this.layout.row2.label = label2;
        this.layout.row2.font = font2;
        this.layout.clear(this.layout.row2);
        this.layout.render(this.layout.row2);
      }

    }

    if (!item || item == 'status') {
      this.layout.start_btn.label =
        this.tri_timer.is_running() ? 'Pause' : 'Start';
      this.layout.render(this.layout.buttons);

      this.layout.row3.label =
        this.tri_timer.display_status()
        + ' ' + this.tri_timer.display_name();
      this.layout.clear(this.layout.row3);
      this.layout.render(this.layout.row3);

      update_status_widget(this.tri_timer);
    }

    if (this.tri_timer.is_running() && this.tri_timer.get() > 0) {
      if (this.timer_timeout) {
        clearTimeout(this.timer_timeout);
        this.timer_timeout = null;
      }

      // Calculate approximate time next display update is needed.
      // Usual case: update when numbers change once per second.
      let next_tick = this.tri_timer.get() % 1;
      if (this.tri_timer.rate > 0) {
        next_tick = 1 - next_tick;
      }
      // Convert next_tick from seconds to milliseconds and add
      // compensating factor of 50ms due to timeouts apparently
      // sometimes triggering too early.
      next_tick = next_tick / Math.abs(this.tri_timer.rate) + 50;

      // For slow-update view mode, only update about every 60
      // seconds, or each time outer value changes, whichever happens
      // first
      if (tt.SETTINGS.view_mode == 3) {
        let next_outer = this.tri_timer.time_to_next_outer();
        let next_event = this.tri_timer.time_to_next_event() % 60000 || Infinity;
        next_tick = Math.min(next_event, next_outer);
        console.debug('Next outer: ' + next_outer);
        console.debug('Next event: ' + next_event);
      }

      console.debug('Next render update scheduled in ' + next_tick);
      this.timer_timeout = setTimeout(
        () => { this.timer_timeout = null; this.render('timer'); },
        next_tick
      );
    }
  }

  start_stop_timer() {
    if (this.tri_timer.is_running()) {
      this.tri_timer.pause();
    } else {
      this.tri_timer.start();
    }
    tt.set_timers_dirty();
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
    const top_menu = {
      '': {
        title: this.tri_timer.display_name(),
        back: this.back.bind(this)
      },
      'Reset': () => { switch_UI(new ResetTimerMenu(this.tri_timer)); },
      'Timers': () => {
        switch_UI(new TimerMenu(tt.TIMERS, this.tri_timer));
      },
      'Edit': () => { switch_UI(new EditTimerMenu(this.tri_timer)); },
      'Add': () => {
        tt.set_timers_dirty();
        const new_timer = tt.add_tri_timer(tt.TIMERS, this.tri_timer);
        switch_UI(new EditTimerMenu(new_timer));
      },
      'Delete': () => { switch_UI(new DeleteTimerMenu(this.tri_timer)); },
      'Silence All': {
        value: tt.SETTINGS.all_silenced,
        format: v => (v ? 'On' : 'Off'),
        onchange: v => {
          tt.SETTINGS.all_silenced = v;
          setTimeout(() => {
            tt.update_system_alarms();
          }, 100);
          tt.schedule_save_settings();
        }
      },
    };
    if (tt.TIMERS.length <= 1) {
      // Prevent user deleting last timer
      delete top_menu.Delete;
    }
    E.showMenu(top_menu);
  }
}

class ResetTimerMenu {
  constructor(tri_timer, back) {
    this.tri_timer = tri_timer;
    this.back = back || this._back;
  }

  _back(ok) {
    if (ok) {
      switch_UI(new TimerView(this.tri_timer));
    } else {
      switch_UI(new TimerViewMenu(this.tri_timer));
    }
  }

  start() {
    const menu = {
      '': {
        title: 'Confirm reset',
        back: () => { this.back(false); }
      },
      'Reset': () => {
        this.tri_timer.reset();
        tt.set_timers_dirty();
        this.back(true);
      },
      'Cancel': () => { this.back(false); },
    };
    if (this.tri_timer.get() > 0) {
      E.showMenu(menu);
    } else {
      menu.Reset();
    }
  }

  stop() {
    E.showMenu();
  }
}

class DeleteTimerMenu {
  constructor(tri_timer, back) {
    this.tri_timer = tri_timer;
    this.back = back || this._back;
  }

  _back(ok, tri_timer) {
    if (ok) {
      switch_UI(new TimerView(tri_timer));
    } else {
      switch_UI(new TimerViewMenu(this.tri_timer));
    }
  }

  start() {
    E.showMenu({
      '': {
        title: 'Confirm delete',
        back: () => { this.back(false); }
      },
      'Delete': () => {
        tt.set_timers_dirty();
        this.back(true, tt.delete_tri_timer(tt.TIMERS, this.tri_timer));
      },
      'Cancel': () => { this.back(false); },
    });
  }

  stop() {
    E.showMenu();
  }
}

class EditTimerMenu {
  constructor(tri_timer, back) {
    this.tri_timer = tri_timer;
    this.back = back || this._back;
  }

  _back() {
    switch_UI(new TimerViewMenu(this.tri_timer));
  }

  start() {
    this.show_menu();
  }

  stop() {
    E.showMenu();
  }

  show_menu() {
    let keyboard = null;
    try { keyboard = require('textinput'); } catch (e) {}

    const menu = {
      '': {
        title: 'Edit: ' + this.tri_timer.display_name(),
        back: this.back.bind(this),
      },
      'Name': {
        value: this.tri_timer.name,
        onchange: () => {
          setTimeout(() => {
            keyboard.input({text:this.tri_timer.name}).then(text => {
              this.tri_timer.name = text;
              tt.set_timers_dirty();
              setTimeout(() => { this.show_menu(); }, 0);
            });
          }, 100);
        }
      },
      'Direction': {
        value: this.tri_timer.rate >= 0,
        format: v => (v ? 'Up' : 'Down'),
        onchange: v => {
          this.tri_timer.rate = -this.tri_timer.rate;
          tt.set_timers_dirty();
        }
      },
      'Start (Tri)': () => { switch_UI(new EditStartTriMenu(this.tri_timer)); },
      'Start (HMS)': () => { switch_UI(new EditStartHMSMenu(this.tri_timer)); },
      'Increment': {
        value: this.tri_timer.increment,
        min: 1,
        max: 9999,
        step: 1,
        wrap: true,
        onchange: v => {
          this.tri_timer.increment = v;
          tt.set_timers_dirty();
        },
      },
      'Events': () => { switch_UI(new EditTimerEventsMenu(this.tri_timer)); },
    };

    if (!keyboard) {
      delete menu.Name;
    }

    E.showMenu(menu);
  }
}

class EditStartTriMenu {
  constructor(tri_timer, back) {
    this.tri_timer = tri_timer;
    this.back = back || this._back;
  }

  _back() {
    switch_UI(new EditTimerMenu(this.tri_timer));
  }

  start() {
    let origin_tri = tt.as_triangle(
      this.tri_timer.origin, this.tri_timer.increment);

    const menu = {
      '': {
        title: 'Start (Tri)',
        back: this.back.bind(this),
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
          menu.Inner.max = origin_tri[0];
          origin_tri[1] = (this.tri_timer.rate >= 0) ?
            1 : origin_tri[0];
          menu.Inner.value = origin_tri[1];
          this.tri_timer.origin = tt.as_linear(
            origin_tri, this.tri_timer.increment
          );
          tt.set_timers_dirty();
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
          this.tri_timer.origin = tt.as_linear(
            origin_tri, this.tri_timer.increment
          );
          tt.set_timers_dirty();
        }
      },
    };

    E.showMenu(menu);
  }

  stop() {
    E.showMenu();
  }
}

class EditStartHMSMenu {
  constructor(tri_timer, back) {
    this.tri_timer = tri_timer;
    this.back = back || this._back;
  }

  _back() {
    switch_UI(new EditTimerMenu(this.tri_timer));
  }

  start() {
    let origin_hms = {
      h: Math.floor(this.tri_timer.origin / 3600),
      m: Math.floor(this.tri_timer.origin / 60) % 60,
      s: Math.floor(this.tri_timer.origin % 60),
    };

    const update_origin = () => {
      this.tri_timer.origin = origin_hms.h * 3600
        + origin_hms.m * 60
        + origin_hms.s;
    };

    const menu = {
      '': {
        title: 'Start (HMS)',
        back: this.back.bind(this),
      },
      'Hours': {
        value: origin_hms.h,
        min: 0,
        max: 9999,
        wrap: true,
        onchange: v => {
          origin_hms.h = v;
          update_origin();
          tt.set_timers_dirty();
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
          tt.set_timers_dirty();
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
          tt.set_timers_dirty();
        }
      },
    };

    E.showMenu(menu);
  }

  stop() {
    E.showMenu();
  }
}

class EditTimerEventsMenu {
  constructor(tri_timer, back) {
    this.tri_timer = tri_timer;
    this.back = back || this._back;
  }

  _back() {
    switch_UI(new EditTimerMenu(this.tri_timer));
  }

  start() {
    const menu = {
      '': {
        title: 'Events',
        back: this.back.bind(this)
      },
      'Outer interval': {
        value: this.tri_timer.outer_event_increment,
        min: 0,
        max: 9999,
        step: this.tri_timer.increment,
        wrap: true,
        noList: true,
        onchange: v => {
          this.tri_timer.outer_event_increment = v;
          tt.set_timers_dirty();
        }
      },
      'Outer alarm': {
        value: this.tri_timer.outer_alarm,
        format: v => (v ? 'On' : 'Off'),
        onchange: v => {
          this.tri_timer.outer_alarm = v;
          tt.set_timers_dirty();
        },
      },
      'Outer action': {
        // Currently there are only two options, so this streamlines the
        // menu so that only a single tap will toggle it. If more
        // options are added, this should be changed to work in a more
        // conventional way.
        value: [false, true][tt.ACTIONS.indexOf(this.tri_timer.outer_action)],
        format: v => (v ? tt.ACTIONS[1] : tt.ACTIONS[0]),
        onchange: v => {
          this.tri_timer.outer_action = tt.ACTIONS[v ? 1 : 0];
          tt.set_timers_dirty();
        },
      },
      'End alarm': {
        value: this.tri_timer.end_alarm,
        format: v => (v ? 'On' : 'Off'),
        onchange: v => {
          this.tri_timer.end_alarm = v;
          tt.set_timers_dirty();
        },
      },
      'Vibrate pattern': require("buzz_menu").pattern(
        this.tri_timer.vibrate_pattern,
        v => this.tri_timer.vibrate_pattern = v),
      'Buzz count': {
        value: this.tri_timer.buzz_count,
        min: 0,
        max: 15,
        step: 1,
        wrap: true,
        format: v => v === 0 ? "Forever" : v,
        onchange: v => {
          this.tri_timer.buzz_count = v;
          tt.set_timers_dirty();
        },
      },
    };

    E.showMenu(menu);
  }

  stop() {
    E.showMenu();
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
  CURRENT_UI.start();
}


// Load and start up app //

Bangle.loadWidgets();
Bangle.drawWidgets();

var CURRENT_UI = null;

tt.update_system_alarms();

update_status_widget(tt.TIMERS[0]);
switch_UI(new TimerView(tt.TIMERS[0]));
