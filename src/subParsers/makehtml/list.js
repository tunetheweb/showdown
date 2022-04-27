////
// makehtml/list.js
// Copyright (c) 2022 ShowdownJS
//
// Transforms MD lists into `<ul>` or `<ol>` html list
//
// Markdown supports ordered (numbered) and unordered (bulleted) lists.
// Unordered lists use asterisks, pluses, and hyphens - interchangably - as list markers
// Ordered lists use numbers followed by periods.
//
// ***Author:***
// - Estevão Soares dos Santos (Tivie) <https://github.com/tivie>
////


showdown.subParser('makehtml.list', function (text, options, globals) {
  'use strict';

  // Start of list parsing
  const subListRgx = /^(( {0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(¨0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;
  const mainListRgx = /(\n\n|^\n?)(( {0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(¨0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;
  const listTypeRgx = /[*+-]/g;

  let startEvent = new showdown.Event('makehtml.list.onStart', text);
  startEvent
    .setOutput(text)
    ._setGlobals(globals)
    ._setOptions(options);
  startEvent = globals.converter.dispatch(startEvent);
  text = startEvent.output;

  // add sentinel to hack around khtml/safari bug:
  // http://bugs.webkit.org/show_bug.cgi?id=11231
  text += '¨0';

  if (globals.gListLevel) {
    text = text.replace(subListRgx, function (wholeMatch, list, m2) {
      return parseConsecutiveLists(subListRgx, list, (m2.search(listTypeRgx) > -1) ? 'ul' : 'ol', true);
    });
  } else {
    text = text.replace(mainListRgx, function (wholeMatch, m1, list, m3) {
      return parseConsecutiveLists(mainListRgx, list, (m3.search(listTypeRgx) > -1) ? 'ul' : 'ol', false);
    });
  }

  // strip sentinel
  text = text.replace(/¨0/, '');

  let afterEvent = new showdown.Event('makehtml.list.onEnd', text);
  afterEvent
    .setOutput(text)
    ._setGlobals(globals)
    ._setOptions(options);
  afterEvent = globals.converter.dispatch(afterEvent);
  return afterEvent.output;


  /**
   *
   * @param {RegExp} pattern
   * @param {string} item
   * @param {boolean} checked
   * @returns {string}
   */
  function processTaskListItem (pattern, item, checked) {

    const checkboxRgx = /^[ \t]*\[([xX ])]/m;
    item = item.replace(checkboxRgx, function (wm, checkedRaw) {

      let attributes = {
        type: 'checkbox',
        disabled: true,
        style: 'margin: 0px 0.35em 0.25em -1.6em; vertical-align: middle;',
        checked: !!checked
      };
      let captureStartEvent = new showdown.Event('makehtml.list.taskListItem.checkbox.onCapture', item);

      captureStartEvent
        .setOutput(null)
        ._setGlobals(globals)
        ._setOptions(options)
        .setRegexp(pattern)
        .setMatches({
          _wholeMatch: item,
          _tasklistButton: wm,
          _taksListButtonChecked: checkedRaw
        })
        .setAttributes(attributes);
      captureStartEvent = globals.converter.dispatch(captureStartEvent);
      let otp;
      if (captureStartEvent.output && captureStartEvent.output !== '') {
        otp = captureStartEvent.output;
      } else {
        attributes = captureStartEvent.attributes;
        otp = '<input' + showdown.helper._populateAttributes(attributes)  + '>';
      }

      let beforeHashEvent = new showdown.Event('makehtml.list.taskListItem.checkbox.onHash', otp);
      beforeHashEvent
        .setOutput(otp)
        ._setGlobals(globals)
        ._setOptions(options);
      beforeHashEvent = globals.converter.dispatch(beforeHashEvent);
      otp = beforeHashEvent.output;
      return otp;
    });

    return item;
  }

  /**
   * Process the contents of a single ordered or unordered list, splitting it
   * into individual list items.
   * @param {string} listStr
   * @param {boolean} trimTrailing
   * @returns {string}
   */
  function processListItems (listStr, trimTrailing) {
    // The $g_list_level global keeps track of when we're inside a list.
    // Each time we enter a list, we increment it; when we leave a list,
    // we decrement. If it's zero, we're not in a list anymore.
    //
    // We do this because when we're not inside a list, we want to treat
    // something like this:
    //
    //    I recommend upgrading to version
    //    8. Oops, now this line is treated
    //    as a sub-list.
    //
    // As a single paragraph, despite the fact that the second line starts
    // with a digit-period-space sequence.
    //
    // Whereas when we're inside a list (or sub-list), that line will be
    // treated as the start of a sub-list. What a kludge, huh? This is
    // an aspect of Markdown's syntax that's hard to parse perfectly
    // without resorting to mind-reading. Perhaps the solution is to
    // change the syntax rules such that sub-lists must start with a
    // starting cardinal number; e.g. "1." or "a.".
    globals.gListLevel++;

    // trim trailing blank lines:
    listStr = listStr.replace(/\n{2,}$/, '\n');

    // attacklab: add sentinel to emulate \z
    listStr += '¨0';

    let rgx = /(\n)?(^ {0,3})([*+-]|\d+[.])[ \t]+((\[([xX ])])?[ \t]*[^\r]+?(\n{1,2}))(?=\n*(¨0| {0,3}([*+-]|\d+[.])[ \t]+))/gm,
        isParagraphed = (/\n[ \t]*\n(?!¨0)/.test(listStr));

    // Since version 1.5, nesting sublists requires 4 spaces (or 1 tab) indentation,
    // which is a syntax breaking change
    // activating this option reverts to old behavior
    // This will be removed in version 2.0
    if (options.disableForced4SpacesIndentedSublists) {
      rgx = /(\n)?(^ {0,3})([*+-]|\d+[.])[ \t]+((\[([xX ])])?[ \t]*[^\r]+?(\n{1,2}))(?=\n*(¨0|\2([*+-]|\d+[.])[ \t]+))/gm;
    }

    listStr = listStr.replace(rgx, function (wholeMatch, m1, m2, m3, m4, taskbtn, checkedRaw) {
      let item = showdown.helper.outdent(m4),
          attributes = {},
          checked = (checkedRaw && checkedRaw.trim() !== ''),
          eventName = 'makehtml.list.listItem',
          captureStartEvent,
          matches = {
            _wholeMatch: wholeMatch,
            listItem: item,
          };


      // Support for github tasklists
      if (taskbtn && options.tasklists) {
        // it's a github tasklist and tasklists are enabled

        // Style used for tasklist bullets
        attributes.classes = ['task-list-item'];
        attributes.style = 'list-style-type: none;';
        if (options.moreStyling && checked) {
          attributes.classes.push('task-list-item-complete');
        }
        eventName = 'makehtml.list.taskListItem';
        matches._taskListButton = taskbtn;
        matches._taskListButtonChecked = checkedRaw;
      }


      captureStartEvent = new showdown.Event(eventName + '.onCapture', item);
      captureStartEvent
        .setOutput(null)
        ._setGlobals(globals)
        ._setOptions(options)
        .setRegexp(rgx)
        .setMatches(matches)
        .setAttributes(attributes);
      captureStartEvent = globals.converter.dispatch(captureStartEvent);

      // if something was passed as output, it takes precedence
      // and will be used as output
      if (captureStartEvent.output && captureStartEvent.output !== '') {
        item = captureStartEvent.output;
      } else {

        attributes = captureStartEvent.attributes;
        item = captureStartEvent.matches.listItem;

        // even if user there's no tasklist, it's fine because the tasklist handler will bail without raising the event
        if (options.tasklists) {
          item = processTaskListItem(rgx, item, checked);
        }

        // ISSUE #312
        // This input: - - - a
        // causes trouble to the parser, since it interprets it as:
        // <ul><li><li><li>a</li></li></li></ul>
        // instead of:
        // <ul><li>- - a</li></ul>
        // So, to prevent it, we will put a marker (¨A)in the beginning of the line
        // Kind of hackish/monkey patching, but seems more effective than overcomplicating the list parser
        item = item.replace(/^([-*+]|\d\.)[ \t]+[\S\n ]*/g, function (wm2) {
          return '¨A' + wm2;
        });

        // SPECIAL CASE: a heading followed by a paragraph of text that is not separated by a double newline
        // or/nor indented. ex:
        //
        // - # foo
        // bar is great
        //
        // While this does now follow the spec per se, not allowing for this might cause confusion since
        // header blocks don't need double-newlines after
        if (/^#+.+\n.+/.test(item)) {
          item = item.replace(/^(#+.+)$/m, '$1\n');
        }

        // m1 - Leading line or
        // Has a double return (multi paragraph)
        if (m1 || (item.search(/\n{2,}/) > -1)) {
          item = showdown.subParser('makehtml.githubCodeBlock')(item, options, globals);
          item = showdown.subParser('makehtml.blockquote')(item, options, globals);
          item = showdown.subParser('makehtml.heading')(item, options, globals);
          item = showdown.subParser('makehtml.list')(item, options, globals);
          item = showdown.subParser('makehtml.codeBlock')(item, options, globals);
          item = showdown.subParser('makehtml.table')(item, options, globals);
          item = showdown.subParser('makehtml.hashHTMLBlocks')(item, options, globals);
          //item = showdown.subParser('makehtml.paragraphs')(item, options, globals);

          // TODO: This is a copy of the paragraph parser
          // This is a provisory fix for issue #494
          // For a permanent fix we need to rewrite the paragraph parser, passing the unhashify logic outside
          // so that we can call the paragraph parser without accidently unashifying previously parsed blocks

          // Strip leading and trailing lines:
          item = item.replace(/^\n+/g, '');
          item = item.replace(/\n+$/g, '');

          let grafs = item.split(/\n{2,}/g),
              grafsOut = [],
              end = grafs.length; // Wrap <p> tags

          for (let i = 0; i < end; i++) {
            let str = grafs[i];
            // if this is an HTML marker, copy it
            if (str.search(/¨([KG])(\d+)\1/g) >= 0) {
              grafsOut.push(str);

              // test for presence of characters to prevent empty lines being parsed
              // as paragraphs (resulting in undesired extra empty paragraphs)
            } else if (str.search(/\S/) >= 0) {
              str = showdown.subParser('makehtml.spanGamut')(str, options, globals);
              str = str.replace(/^([ \t]*)/g, '<p>');
              str += '</p>';
              grafsOut.push(str);
            }
          }
          item = grafsOut.join('\n');
          // Strip leading and trailing lines:
          item = item.replace(/^\n+/g, '');
          item = item.replace(/\n+$/g, '');

        } else {

          // Recursion for sub-lists:
          item = showdown.subParser('makehtml.list')(item, options, globals);
          item = item.replace(/\n$/, ''); // chomp(item)
          item = showdown.subParser('makehtml.hashHTMLBlocks')(item, options, globals);

          // Colapse double linebreaks
          item = item.replace(/\n\n+/g, '\n\n');

          if (isParagraphed) {
            item = showdown.subParser('makehtml.paragraphs')(item, options, globals);
          } else {
            item = showdown.subParser('makehtml.spanGamut')(item, options, globals);
          }
        }

        // now we need to remove the marker (¨A)
        item = item.replace('¨A', '');
        // we can finally wrap the line in list item tags

        item =  '<li' + showdown.helper._populateAttributes(attributes) + '>' + item + '</li>\n';

      }

      let beforeHashEvent = new showdown.Event(eventName + '.onHash', item);
      beforeHashEvent
        .setOutput(item)
        ._setGlobals(globals)
        ._setOptions(options);
      beforeHashEvent = globals.converter.dispatch(beforeHashEvent);
      return beforeHashEvent.output;
    });

    // attacklab: strip sentinel
    listStr = listStr.replace(/¨0/g, '');

    globals.gListLevel--;

    if (trimTrailing) {
      listStr = listStr.replace(/\s+$/, '');
    }

    return listStr;
  }

  /**
   *
   * @param {string} list
   * @param {string} listType
   * @returns {string|null}
   */
  function styleStartNumber (list, listType) {
    // check if ol and starts by a number different than 1
    if (listType === 'ol') {
      let res = list.match(/^ *(\d+)\./);
      if (res && res[1] !== '1') {
        return res[1];
      }
    }
    return null;
  }

  /**
   * Check and parse consecutive lists (better fix for issue #142)
   * @param {RegExp} pattern
   * @param {string} list
   * @param {string} listType
   * @param {boolean} trimTrailing
   * @returns {string}
   */
  function parseConsecutiveLists (pattern, list, listType, trimTrailing) {
    let otp = '';
    let captureStartEvent = new showdown.Event('makehtml.list.onCapture', list);
    captureStartEvent
      .setOutput(null)
      ._setGlobals(globals)
      ._setOptions(options)
      .setRegexp(pattern)
      .setMatches({
        _wholeMatch: list,
        list: list
      })
      .setAttributes({});
    captureStartEvent = globals.converter.dispatch(captureStartEvent);
    let attributes = captureStartEvent.attributes;
    // if something was passed as output, it takes precedence
    // and will be used as output
    if (captureStartEvent.output && captureStartEvent.output !== '') {
      otp = captureStartEvent.output;
    } else {

      // check if we caught 2 or more consecutive lists by mistake
      // we use the counterRgx, meaning if listType is UL we look for OL and vice versa
      const olRgx = (options.disableForced4SpacesIndentedSublists) ? /^ ?\d+\.[ \t]/gm : /^ {0,3}\d+\.[ \t]/gm;
      const ulRgx = (options.disableForced4SpacesIndentedSublists) ? /^ ?[*+-][ \t]/gm : /^ {0,3}[*+-][ \t]/gm;
      let counterRxg = (listType === 'ul') ? olRgx : ulRgx;

      let attrs = showdown.helper.cloneObject(attributes);
      if (list.search(counterRxg) !== -1) {

        (function parseCL (txt) {
          let pos = txt.search(counterRxg);
          attrs.start = styleStartNumber(list, listType);

          if (pos !== -1) {
            // slice
            otp += '\n\n<' + listType + showdown.helper._populateAttributes(attrs) + '>\n' + processListItems(txt.slice(0, pos), !!trimTrailing) + '</' + listType + '>\n';

            // invert counterType and listType
            listType = (listType === 'ul') ? 'ol' : 'ul';
            counterRxg = (listType === 'ul') ? olRgx : ulRgx;

            //recurse
            parseCL(txt.slice(pos), attrs);
          } else {
            otp += '\n\n<' + listType + showdown.helper._populateAttributes(attrs) + '>\n' + processListItems(txt, !!trimTrailing) + '</' + listType + '>\n';
          }
        })(list, attributes);

      } else {
        attrs.start = styleStartNumber(list, listType);
        otp = '\n\n<' + listType + showdown.helper._populateAttributes(attrs) + '>\n' + processListItems(list, !!trimTrailing) + '</' + listType + '>\n';
      }
    }
    return otp;
  }
});