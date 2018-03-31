<img alt="Garbochess icon" width="64" src="oliver/img/icons/garbochess128.png" /> Garbochess-JS
=============

* <em>Start an online</em> <b>Garbochess-JS</b> <em>session on</em> http://omerkel.github.io/Garbochess-JS/oliver
* <em>Android APK available for install</em> <img align="top" width="32" src="oliver/res/android.gif" /> https://github.com/OMerkel/Garbochess-JS/releases/tag/release_6.0.1
    * requires minimum Android 4.4.2 (API-19)
* <em>runs in various browsers on</em>
    * <em>desktop systems like BSDs, Linux, Win, MacOS and</em>
    * <em>mobile platforms like Android, FirefoxOS, iOS.</em>

<b>Keywords</b> <em>Chess, Schach, Ajedrez, Computer Chess, ECMA script, <a href="http://www.w3.org/TR/workers/">Web workers</a>, CC0: <a href="http://www.w3.org/Graphics/SVG/">Scalable Vector Graphics (SVG)</a> chess set, Safari Apple-mobile-web-app support</em>

Thanks
------
- Stockfish authors
- Crafty authors

Version 1.0
-----------
- Rewrote move generation for a big speed-up
- Pure material evaluation
- Null-move + Razoring + LMR in main search
- Hash table

Version 2.0
-----------
- Mobility evaluation (thanks Fruit) 
- Bishop pair 
- Rep-draw detection 
- Better null-move pruning (thanks Stockfish) 
- Better LMR (and again, thanks Stockfish) 
- Bugfix with using hash move 
- Some speed optimizations

Version 3.0
-----------
- 604.5/1000 or ~70 ELO better than previous version
- Killer moves
- Tuned PSQ tables/mobility
- Better king eval in endgame (won't stay on back row)
- Show '#' for checkmate
- Improved UI (new game, switch black/white, choose time/move)
- Fixed crashes from using invalid hash moves
- Other small bug fixes
- Speed optimizations

Version 4.0
-----------
- 594.5/1000 %:59.45 or 66 Elo better than previous
- SEE added (QSearch pruning, losing captures in main search)
- No nullmove in pawn endgames
- Fixed hashtable bugs (RNG was bad)
- Fixed starting position when playing black
- Added ability to analyze position for browsers that support it
- Added support for pasting FEN positions

Version 5.0
-----------
- Added checks in first ply of q-search (+15)

Version 5.1
-----------
- Bugfix to hashtable storing (no elo change, but big help in endgames)

Version 6.0
-----------
- Bonuses for knight attacking pieces (+20)
- Bonus for bishop pins (+40)

TODO
----
- Only extend checks with SEE > 0?
- Single reply to check should be marked as dangerous.
