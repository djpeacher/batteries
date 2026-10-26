# Batteries

A personal static website that holds small, self-contained software and engineering tools, all running in the browser.

## Language

**Batteries**:
The site as a whole: the shelf that holds every battery. "Batteries Included" is its tagline.
_Avoid_: toolbox, toolkit, app

**Battery**:
One small tool on the shelf, with its own page. The owner writes it as code inside this project. Visitors never create batteries in the browser.
_Avoid_: tool, widget, utility, plugin

**Shelf**:
The home page, which lists every battery so you can open one.
_Avoid_: dashboard, index, launcher

**Shelf entry**:
One battery's place on the Shelf: its name, its blurb, and the target you click to go inside it. One per battery, all alike.
_Avoid_: card, tile, item, link

**Frame**:
What surrounds every battery's own page: the header, the way back to the Shelf, and the theme toggle. The same on every battery; the battery's own content sits inside it.
_Avoid_: chrome, shell, layout, wrapper

**Local promise**:
The one line, the same on the Shelf and in every Frame, telling visitors that everything runs in their browser and nothing they type or open leaves their device. Unlike a battery's blurb, it says nothing about what a battery does, only where the work happens.
_Avoid_: privacy note, disclaimer, badge, offline notice

**Mark**:
The small Batteries emblem a browser shows for the site: on its tab, in bookmarks and on a phone home screen. The same on the Shelf and every battery, with a light and a dark version that follow the OS. Unlike the Frame's header, it appears outside the page, never in it.
_Avoid_: logo, favicon, icon

**Switcher**:
The menu behind a battery's name in the Frame. It lists every battery, with "All batteries" first as the way back to the Shelf. Unlike the Shelf, it is a quick list of names only, reached from inside a battery.
_Avoid_: dropdown, picker, nav menu

**Theme toggle**:
The button in the header's right slot, on the Shelf and in every Frame. Its icon shows the theme on screen, and it opens a menu of Light, Dark and System. System, the default, follows the OS, and Light or Dark override it. Unlike the Switcher, it changes how the site looks, not where you are.
_Avoid_: dark mode switch, appearance picker, mode toggle

**Markdown Preview**:
The battery where you type markdown and see it rendered live.
_Avoid_: markdown previewer, md viewer

**Text side**:
The half of Markdown Preview where you type or paste the markdown. Unlike the rendered side, it shows the raw text exactly as written.
_Avoid_: editor, source, input pane

**Rendered side**:
The half of Markdown Preview that shows the markdown as a formatted page, updated live. Unlike the text side, it can't be typed into.
_Avoid_: preview, output, result pane

**Toolbar**:
The row above a battery's two sides that holds its controls: in Markdown Preview the mode control and Open; in Text Diff the view control, the ignore toggles, the change count and Swap (each Text Diff side has its own Open). Unlike the Frame's header, it belongs to the battery alone.
_Avoid_: action bar, controls

**Mode control**:
The control in the toolbar that switches between split, text only and rendered only. Unlike Open, it changes what you see, not what the document holds.
_Avoid_: view toggle, layout switcher

**Diagram canvas**:
The dotted, bordered panel a Mermaid diagram is drawn on, on the rendered side. Unlike a code block, which shows text, it holds a drawing.
_Avoid_: diagram box, chart frame

**Diagram error**:
What appears in place of a diagram whose source can't be drawn: a dark, console-style panel giving the parser's message. It reports a problem in the document, not an empty one.
_Avoid_: render failure, broken diagram

**Text Diff**:
The battery where you supply two texts and see the differences between them highlighted.
_Avoid_: differ, diff visualizer, compare tool

**Old side**:
The left box of Text Diff, holding the original text. Unlike the new side, its lines show as removed where they differ.
_Avoid_: left pane, original box, before

**New side**:
The right box of Text Diff, holding the changed text. Unlike the old side, its lines show as added where they differ.
_Avoid_: right pane, modified box, after

**Result**:
The highlighted comparison below Text Diff's two sides, updated live. Unlike the old and new sides, it can't be typed into.
_Avoid_: output, diff pane, comparison

**View control**:
The control in Text Diff that switches the result between side-by-side and combined. Unlike Markdown Preview's mode control, it changes how the comparison is shown, not which sides are visible.
_Avoid_: layout switcher, mode toggle

**Gutter**:
The shaded strip of line numbers down the left of Text Diff's old side and new side, numbered the same way as the result. Unlike the text beside it, it can't be typed into or selected; it only says which line is which.
_Avoid_: line-number column, ruler, margin

**Ignore toggles**:
The two buttons in Text Diff's toolbar, "Ignore whitespace" and "Ignore case", each with a check square that fills when on. Unlike the view control, they change what counts as a difference, not how the result is shown, and both can be on at once.
_Avoid_: filters, options, checkboxes

**Change count**:
The "+N −M lines" figure in Text Diff's toolbar: lines added and removed, a changed line counting as one of each. Unlike the result, it summarises the comparison without showing it; it's empty when there are no differences.
_Avoid_: stats, diffstat, summary

**Fold row**:
The full-width bar in Text Diff's result that stands in for a run of unchanged lines, reading "Show N unchanged lines" with an arrow pointing to where they are. Unlike the result's other rows, it holds no text from either side; clicking it puts the hidden lines back.
_Avoid_: collapsed section, expander, gap
