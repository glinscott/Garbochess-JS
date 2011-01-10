var g_startOffset;
var moveNumber = 1;

var g_lastMove = null;
var g_playerWhite = true;
var g_changingFen = false;
var g_analyzing = false;

function UINewGame() {
    moveNumber = 1;

    var pgnTextBox = document.getElementById("PgnTextBox");
    pgnTextBox.value = "";

    EnsureAnalysisStopped();
    ResetGame();
    if (InitializeBackgroundEngine()) {
        g_backgroundEngine.postMessage("go");
    }
    g_lastMove = null;

    if (!g_playerWhite) {
        SearchAndRedraw();
    } else {
        RedrawBoard();
    }
}

function EnsureAnalysisStopped() {
    if (g_analyzing && g_backgroundEngine != null) {
        g_backgroundEngine.terminate();
        g_backgroundEngine = null;
    }
}

function UIAnalyzeToggle() {
    if (InitializeBackgroundEngine()) {
        if (!g_analyzing) {
            g_backgroundEngine.postMessage("analyze");
        } else {
            EnsureAnalysisStopped();
        }
        g_analyzing = !g_analyzing;
        document.getElementById("AnalysisToggleLink").innerText = g_analyzing ? "Analysis: On" : "Analysis: Off";
    } else {
        alert("Your browser must support web workers for analysis - (chrome4, ff4, safari)");
    }
}

function UIChangeFEN() {
    if (!g_changingFen) {
        var fenTextBox = document.getElementById("FenTextBox");
        InitializeFromFen(fenTextBox.value);
        EnsureAnalysisStopped();
        if (InitializeBackgroundEngine()) {
            g_backgroundEngine.postMessage("go");
            g_backgroundEngine.postMessage("position " + GetFen());
        }
        g_playerWhite = !!g_toMove;
        RedrawBoard();
    }
}

function UIChangeStartPlayer() {
    g_playerWhite = !g_playerWhite;
    RedrawBoard();
}

function UpdatePgnTextBox(move) {
    var pgnTextBox = document.getElementById("PgnTextBox");
    if (g_toMove != 0) {
        pgnTextBox.value += moveNumber + ". ";
        moveNumber++;
    }
    pgnTextBox.value += GetMoveSAN(move) + " ";
}

function UIChangeTimePerMove() {
    var timePerMove = document.getElementById("TimePerMove");
    g_timeout = parseInt(timePerMove.value, 10);
}

function FinishMove(bestMove, value, timeTaken, ply) {
    if (bestMove != null) {
        UIPlayMove(bestMove, BuildPVMessage(bestMove, value, timeTaken, ply));
    }
    else {
        alert("Checkmate!");
    }
}

function UIPlayMove(move, pv) {
    UpdatePgnTextBox(move);

    g_lastMove = move;
    MakeMove(move);

    UpdatePVDisplay(pv);
}

function UpdatePVDisplay(pv) {
    if (pv != null) {
        var outputDiv = document.getElementById("output");
        if (outputDiv.firstChild != null) {
            outputDiv.removeChild(outputDiv.firstChild);
        }
        outputDiv.appendChild(document.createTextNode(pv));
    }
}

function SearchAndRedraw() {
    if (g_analyzing) {
        EnsureAnalysisStopped();
        InitializeBackgroundEngine();
        g_backgroundEngine.postMessage("position " + GetFen());
        g_backgroundEngine.postMessage("analyze");
        return;
    }

    if (InitializeBackgroundEngine()) {
        if (g_lastMove != null) {
            g_backgroundEngine.postMessage(FormatMove(g_lastMove));
        }
        g_backgroundEngine.postMessage("search " + g_timeout);
    } else {
	    Search(FinishMove, 99, null);
	    setTimeout("RedrawBoard()", 100);
    }
}

var g_backgroundEngineValid = true;
var g_backgroundEngine;

function InitializeBackgroundEngine() {
    if (!g_backgroundEngineValid) {
        return false;
    }

    if (g_backgroundEngine == null) {
        g_backgroundEngineValid = true;
        try {
            g_backgroundEngine = new Worker("js/garbochess.js");
            g_backgroundEngine.onmessage = function (e) {
                if (e.data.match("^pv") == "pv") {
                    UpdatePVDisplay(e.data.substr(3, e.data.length - 3));
                } else {
                    UIPlayMove(GetMoveFromString(e.data), null);
                    RedrawBoard();
                }
            }
            g_backgroundEngine.error = function (e) {
                alert("Error from background worker:" + e.message);
            }
        } catch (error) {
            g_backgroundEngineValid = false;
        }
    }

    return g_backgroundEngineValid;
}

function RedrawBoard() {
    var div = $("#board")[0];
    $("#board").empty();

    var table = document.createElement("table");
    table.cellPadding = "0px";
    table.cellSpacing = "0px";

    var tbody = document.createElement("tbody");

    var cellSize = 45;

    var guiTable = new Array();

    for (y = 0; y < 8; ++y) {
        var tr = document.createElement("tr");

        for (x = 0; x < 8; ++x) {
            var td = document.createElement("td");
            td.style.width = cellSize + "px";
            td.style.height = cellSize + "px";

            var pieceY = g_playerWhite ? y : 7 - y;
            var piece = g_board[((pieceY + 2) * 0x10) + (g_playerWhite ? x : 7 - x) + 4];
            var pieceName = null;
            switch (piece & 0x7) {
                case piecePawn: pieceName = "pawn"; break;
                case pieceKnight: pieceName = "knight"; break;
                case pieceBishop: pieceName = "bishop"; break;
                case pieceRook: pieceName = "rook"; break;
                case pieceQueen: pieceName = "queen"; break;
                case pieceKing: pieceName = "king"; break;
            }
            if (pieceName != null) {
                pieceName += "_";
                pieceName += (piece & 0x8) ? "white" : "black";
                pieceName += ".png";
            }

            if (pieceName != null) {
                var img = document.createElement("img");
                img.src = "img/" + pieceName;
                img.width = cellSize;
                img.height = cellSize;
                td.appendChild(img);

                $(img).draggable({ start: function (e, ui) {
                    g_startOffset = new Object();
                    g_startOffset.left = e.clientX - $(table).offset().left;
                    g_startOffset.top = e.clientY - $(table).offset().top;
                }
                });
            }

            var bgColor = (y ^ x) & 1;
            if (bgColor) {
                td.style.backgroundColor = "#888888";
            }
            else {
                td.style.backgroundColor = "#FFFFFF";
            }

            tr.appendChild(td);
            guiTable[y * 8 + x] = td;
        }

        tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    $(table).droppable({ drop: function (e, ui) {
        // TODO: this may be buggy?
        var endX = e.clientX - $(table).offset().left;
        var endY = e.clientY - $(table).offset().top;

        endX = Math.floor(endX / cellSize);
        endY = Math.floor(endY / cellSize);

        var startX = Math.floor(g_startOffset.left / cellSize);
        var startY = Math.floor(g_startOffset.top / cellSize);

        if (!g_playerWhite) {
            startY = 7 - startY;
            endY = 7 - endY;
            startX = 7 - startX;
            endX = 7 - endX;
        }

        var moves = GenerateValidMoves();
        var move = null;
        for (var i = 0; i < moves.length; i++) {
            if ((moves[i] & 0xFF) == MakeSquare(startY, startX) &&
                ((moves[i] >> 8) & 0xFF) == MakeSquare(endY, endX)) {
                move = moves[i];
            }
        }

        if (!g_playerWhite) {
            startY = 7 - startY;
            endY = 7 - endY;
            startX = 7 - startX;
            endX = 7 - endX;
        }

        var img = ui.helper.get(0);
        img.style.left = 0;
        img.style.top = 0;

        if (move != null) {
            UpdatePgnTextBox(move);

            g_lastMove = move;
            MakeMove(move);
            img.parentNode.removeChild(img);

            if (g_board[(move >> 8) & 0xFF] != 0) {
                $(guiTable[endY * 8 + endX]).empty();
            }
            guiTable[endY * 8 + endX].appendChild(img);

            var fen = GetFen();
            document.getElementById("FenTextBox").value = fen;

            setTimeout("SearchAndRedraw()", 0);
        }
    }
    });

    div.appendChild(table);

    g_changingFen = true;
    document.getElementById("FenTextBox").value = GetFen();
    g_changingFen = false;
}