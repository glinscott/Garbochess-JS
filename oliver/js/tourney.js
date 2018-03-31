var g_lastMove = null;
var g_currentTestGame = 0;
var g_currentTestWhite = false;
var g_myScore = 0;
var g_gameOver = false;
var oldGarboChess = null;

function sleep(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() < start + delay);
}

function AddGameOver(s1, s2) {
    if (g_toMove == 8) {
        // White mated
        if (!g_currentTestWhite) {
            g_myScore += s1;
        } else {
            g_myScore += s2;
        }
    } else {
        // Black mated
        if (g_currentTestWhite) {
            g_myScore += s1;
        } else {
            g_myScore += s2;
        }
    }  
}

function CheckGameOver(move) {
    if (g_gameOver) return;

    MakeMove(move);
    if (GenerateValidMoves().length == 0 || IsRepDraw() || g_move50 >= 20) {
        if (g_inCheck) {
            AddGameOver(1, 0);
        } else {
            if (!IsRepDraw()) {
                if (g_baseEval > 5000) {
                    AddGameOver(1, 0);
                } else if (g_baseEval < -5000) {
                    AddGameOver(0, 1);
                } else {
                    g_myScore += 0.5;
                }
            } else {
                g_myScore += 0.5;
            }
        }

        g_gameOver = true;
        g_lastMove = null;
        if (g_currentTestWhite) {
            g_currentTestWhite = false;
            g_currentTestGame++;
        } else {
            g_currentTestWhite = true;
        }

        setTimeout("TestGames()", 0);
        return true;
    }
    g_gameOver = false;
    return false;
}

function FinishMoveTestGames(bestMove, value, timeTaken, ply) {
    if (bestMove != null) {
        g_lastMove = bestMove;
        CheckGameOver(bestMove);
        if (!g_gameOver) {
            TestGame();
        }
    }
}

function TestGamesCallback() {
    if (g_gameOver) return;
    Search(FinishMoveTestGames, 99, null);
}

function TestGame() {
    if (g_gameOver) return;
    if (g_lastMove != null) {
        oldGarboChess.postMessage(FormatMove(g_lastMove));
    }
    oldGarboChess.postMessage("search " + g_timeout);
}

function TestGames() {
    if (oldGarboChess == null) {
        oldGarboChess = new Worker("js/garbochess-old.js");
        oldGarboChess.onmessage = function (e) {
            if (e.data[0] != 'p') {
                if (!CheckGameOver(GetMoveFromString(e.data))) {
                    TestGamesCallback();
                }
            }
        }
        oldGarboChess.error = function (e) {
            alert(e.message);
        }
    }

    if (g_gameOver) {
        var totalGames = ((g_currentTestGame * 2) + (g_currentTestWhite ? 1 : 0));
        var percentage = g_myScore / totalGames;
        var eloDifference = -400 * Math.log(1 / percentage - 1) / Math.LN10;

        var statusString = g_myScore + "/" + totalGames + " %:" + (Math.round(percentage * 10000) / 100) + " Elo:" + Math.round(eloDifference);
        var outputDiv = document.getElementById("output");
        outputDiv.removeChild(outputDiv.childNodes[0]);
        outputDiv.appendChild(document.createTextNode(statusString));
    }

    if (g_currentTestGame >= 500) {
        return;
    }

    g_gameOver = false;
    ResetGame();
    InitializeFromFen(g_testOpenings[g_currentTestGame]);

    oldGarboChess.postMessage("position " + g_testOpenings[g_currentTestGame]);

    if (g_currentTestWhite) {
        Search(FinishMoveTestGames, 99, null);
    } else {
        TestGame();
    }
}
