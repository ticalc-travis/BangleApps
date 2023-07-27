/* Simple clock that appears in the widget bar if no other clock is
running.  Based on widclk but with a customized font aimed at better
visibility yet with some space savings */
WIDGETS.widclk={
  area:"tl",

  width:Bangle.CLOCK?0:42,

  draw:function() {
    expected_width = Bangle.CLOCK?0:42;
    if (this.width != expected_width) {
      // redraw on widget resize
      this.width = expected_width;
      return setTimeout(Bangle.drawWidgets,1);
    }
    if (!this.width) return; // nothing to do if widget not visible

    // 18-pixel-height font containing space, -, 0–9, and : characters
    g.reset().setFontCustom(
      atob("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAHAAHAAAAcAAcAAcAAcAAcAAcAAAAP/8f/+///4AH4AH///f/+P/8AAAAAAMAHcAH/////////AAHAAHAAA4H/4P/4f/4cH4cH/8Hf4HPwHAAA4AH4cH4cH4cH4cH///f/+Pj8AAA/8A/8A/8AAcAAcA/////////AAAP4Hf8H/8H4cH4cH4f/4f+4P8AAAP/8f/+///4cH4cH4f/4P+AH8AAA4AA4AA4P/4f/////8A/4AAAAAAAPj8f/+///4cH4cH///f/+Pj8AAAPwAf4A/8H4cf4d///8f/wP/AAAADjgDjgDjgAAAA="),
      32,
      atob("CQAAAAAAAAAAAAAAAAQHAAkJCQkJCQkJCQkE"),
      18
    );
    var time = require("locale").time(new Date(), 1);
    g.drawString(time, this.x+1, this.y+3, true);
    // queue draw for the next minute
    if (this.drawTimeout) clearTimeout(this.drawTimeout);
    this.drawTimeout = setTimeout(()=>{
      this.drawTimeout = undefined;
      this.draw();
    }, 60000 - (Date.now() % 60000));
  }
};
