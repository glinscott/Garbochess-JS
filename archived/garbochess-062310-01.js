"use strict";

// Vs current best -> 587/1057 %:55.53453169347209

// Perf TODO:
// Merge material updating with psq values
// Put move scoring inline in generator
// Remove need for fliptable in psq tables.  Access them by color
// Unroll non-capture move generator

// Non-perf todo:
// Killer moves!
// SEE!
// Checks in first q?
// Pawn eval.
// Better king evaluation

var g_debug = true;
var g_timeout = 20;

function GetFen(){
    var result = "";
    for (row = 0; row < 8; row++) {
        if (row != 0) 
            result += '/';
        var empty = 0;
        for (col = 0; col < 8; col++) {
            var piece = g_board[((row + 2) << 4) + col + 4];
            if (piece == 0) {
                empty++;
            }
            else {
                if (empty != 0) 
                    result += empty;
                empty = 0;
                
                var pieceChar = [" ", "p", "n", "b", "r", "q", "k", " "][(piece & 0x7)];
                result += ((piece & colorWhite) != 0) ? pieceChar.toUpperCase() : pieceChar;
            }
        }
        if (empty != 0) {
            result += empty;
        }
    }
    
    result += g_toMove == colorBlack ? " b" : " w";
    result += " ";
    if (g_castleRights == 0) {
        result += "-";
    }
    else {
        if ((g_castleRights & 1) != 0) 
            result += "K";
        if ((g_castleRights & 2) != 0) 
            result += "Q";
        if ((g_castleRights & 4) != 0) 
            result += "k";
        if ((g_castleRights & 8) != 0) 
            result += "q";
    }
    
    result += " ";
    
    if (g_enPassentSquare == -1) {
        result += '-';
    }
    else {
        result += FormatSquare(g_enPassentSquare);
    }
    
    return result;
}

function GetMoveSAN(move, validMoves) {
	var from = move & 0xFF;
	var to = (move >> 8) & 0xFF;
	
	if (move & moveflagCastleKing) return "O-O";
	if (move & moveflagCastleQueen) return "O-O-O";
	
	var pieceType = g_board[from] & 0x7;
	var result = ["", "", "N", "B", "R", "Q", "K", ""][pieceType];
	
	var dupe = false, rowDiff = true, colDiff = true;
	if (validMoves == null) {
		validMoves = GenerateValidMoves();
	}
	for (var i = 0; i < validMoves.length; i++) {
		var moveFrom = validMoves[i] & 0xFF;
		var moveTo = (validMoves[i] >> 8) & 0xFF; 
		if (moveFrom != from &&
			moveTo == to &&
			(g_board[moveFrom] & 0x7) == pieceType) {
			dupe = true;
			if ((moveFrom & 0xF0) == (from & 0xF0)) {
				rowDiff = false;
			}
			if ((moveFrom & 0x0F) == (from & 0x0F)) {
				colDiff = false;
			}
		}
	}
	
	if (dupe) {
		if (colDiff) {
			result += FormatSquare(from).charAt(0);
		} else if (rowDiff) {
			result += FormatSquare(from).charAt(1);
		} else {
			result += FormatSquare(from);
		}
	} else if (pieceType == piecePawn && g_board[to] != 0) {
		result += FormatSquare(from).charAt(0);
	}
	
	if (g_board[to] != 0 || (move & moveflagEPC)) {
		result += "x";
	}
	
	result += FormatSquare(to);
	
	if (move & moveflagPromotion) {
		if (move & moveflagPromoteBishop) result += "=B";
		else if (move & moveflagPromoteKnight) result += "=N";
		else if (move & moveflagPromoteQueen) result += "=Q";
		else result += "=R";
	}
	
	MakeMove(move);
	if (g_inCheck) {
	    result += GenerateValidMoves().length == 0 ? "#" : "+";
	}
	UnmakeMove(move);

	return result;
}

function FormatSquare(square) {
    var letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return letters[(square & 0xF) - 4] + ((9 - (square >> 4)) + 1);
}

function FormatMove(move) {
    return FormatSquare(move & 0xFF) + FormatSquare((move >> 8) & 0xFF);
}

function PVFromHash(move, ply) {
    if (ply == 0) 
        return "";
    
    var pvString = " " + GetMoveSAN(move);
    MakeMove(move);
    
    var hashNode = g_hashTable[g_hashKey & g_hashMask];
    if (hashNode != null && hashNode.lock == g_hashKey && hashNode.bestMove != null) {
        pvString += PVFromHash(hashNode.bestMove, ply - 1);
    }
    
    UnmakeMove(move);
    
    return pvString;
}

//
// Searching code
//

var g_startTime;

var g_nodeCount;
var g_qNodeCount;
var g_searchValid;
var g_globalPly = 0;

function Search(finishMoveCallback, maxPly) {
    var lastEval;
    var alpha = minEval;
    var beta = maxEval;
    
	g_globalPly++;
    g_nodeCount = 0;
    g_qNodeCount = 0;
    g_collisions = 0;
    g_searchValid = true;
    
    var bestMove;
    var value;
    
    g_startTime = (new Date()).getTime();

    var i;
    for (i = 1; i <= maxPly && g_searchValid; i++) {
        var tmp = AlphaBeta(i, 0, alpha, beta);
        if (!g_searchValid) break;

        value = tmp;

        if (value > alpha && value < beta) {
            alpha = value - 500;
            beta = value + 500;
        } else if (alpha != minEval) {
            alpha = minEval;
            beta = maxEval;
            i--;
            continue;
        }

        if (g_hashTable[g_hashKey & g_hashMask] != null) {
            bestMove = g_hashTable[g_hashKey & g_hashMask].bestMove;
        }
    }
    
    finishMoveCallback(bestMove, value, (new Date()).getTime() - g_startTime, i - 1);
}

var minEval = -2000000;
var maxEval = +2000000;

var minMateBuffer = minEval + 2000;
var maxMateBuffer = maxEval - 2000;

var materialTable = [0, 800, 3350, 3450, 5000, 9750, 600000];

var pawnAdj =
[
  0, 0, 0, 0, 0, 0, 0, 0,
  -75, 5, 35, 177, 177, 35, 5, -75,
  -80, 0, 30, 176, 176, 30, 0, -80,
  -85, -5, 25, 175, 175, 25, -5, -85,
  -90, -10, 20, 125, 125, 20, -10, -90,
  -95, -15, 15, 75, 75, 15, -15, -95, 
  -100, -20, 10, 70, 70, 10, -20, -100, 
  0, 0, 0, 0, 0, 0, 0, 0
];

var knightAdj =
    [-200, -100, -50, -50, -50, -50, -100, -200,
      -100, 0, 0, 0, 0, 0, 0, -100,
      -50, 0, 60, 60, 60, 60, 0, -50,
      -50, 0, 30, 60, 60, 30, 0, -50,
      -50, 0, 30, 60, 60, 30, 0, -50,
      -50, 0, 30, 30, 30, 30, 0, -50,
      -100, 0, 0, 0, 0, 0, 0, -100,
      -200, -50, -25, -25, -25, -25, -50, -200
     ];

var bishopAdj =
    [ -50,-50,-25,-10,-10,-25,-50,-50,
      -50,-25,-10,  0,  0,-10,-25,-50,
      -25,-10,  0, 25, 25,  0,-10,-25,
      -10,  0, 25, 40, 40, 25,  0,-10,
      -10,  0, 25, 40, 40, 25,  0,-10,
      -25,-10,  0, 25, 25,  0,-10,-25,
      -50,-25,-10,  0,  0,-10,-25,-50,
      -50,-50,-25,-10,-10,-25,-50,-50
     ];

var rookAdj =
    [ -60, -30, -10, 20, 20, -10, -30, -60,
       40,  70,  90,120,120,  90,  70,  40,
      -60, -30, -10, 20, 20, -10, -30, -60,
      -60, -30, -10, 20, 20, -10, -30, -60,
      -60, -30, -10, 20, 20, -10, -30, -60,
      -60, -30, -10, 20, 20, -10, -30, -60,
      -60, -30, -10, 20, 20, -10, -30, -60,
      -60, -30, -10, 20, 20, -10, -30, -60
     ];

var kingAdj =
    [  50, 150, -25, -125, -125, -25, 150, 50,
       50, 150, -25, -125, -125, -25, 150, 50,
       50, 150, -25, -125, -125, -25, 150, 50,
       50, 150, -25, -125, -125, -25, 150, 50,
       50, 150, -25, -125, -125, -25, 150, 50,
       50, 150, -25, -125, -125, -25, 150, 50,
       50, 150, -25, -125, -125, -25, 150, 50,
      150, 250, 75, -25, -25, 75, 250, 150
     ];

var emptyAdj =
    [0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
        0, 0, 0, 0, 0, 0, 0, 0, 
     ];

var pieceSquareAdj = new Array(8);

// Returns the square flipped
var flipTable = new Array(256);

function PawnEval(color) {
    var pieceIdx = (color | 1) << 4;
    var from = g_pieceList[pieceIdx++];
    while (from != 0) {
        from = g_pieceList[pieceIdx++];
    }
}

function Mobility(color) {
    var result = 0;
    var from, to, mob, pieceIdx;
    var enemy = color == 8 ? 0x10 : 0x8
    var mobUnit = color == 8 ? g_mobUnit[0] : g_mobUnit[1];

    // Knight mobility
    mob = -3;
    pieceIdx = (color | 2) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        mob += mobUnit[g_board[from + 31]];
        mob += mobUnit[g_board[from + 33]];
        mob += mobUnit[g_board[from + 14]];
        mob += mobUnit[g_board[from - 14]];
        mob += mobUnit[g_board[from - 31]];
        mob += mobUnit[g_board[from - 33]];
        mob += mobUnit[g_board[from + 18]];
        mob += mobUnit[g_board[from - 18]];
        from = g_pieceList[pieceIdx++];
    }
    result += 65 * mob;

    // Bishop mobility
    mob = -4;
    pieceIdx = (color | 3) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        to = from - 15; while (g_board[to] == 0) { to -= 15; mob++; } if (g_board[to] & enemy) mob++;
        to = from - 17; while (g_board[to] == 0) { to -= 17; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 15; while (g_board[to] == 0) { to += 15; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 17; while (g_board[to] == 0) { to += 17; mob++; } if (g_board[to] & enemy) mob++;
        from = g_pieceList[pieceIdx++];
    }
    result += 50 * mob;

    // Rook mobility
    mob = -4;
    pieceIdx = (color | 4) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        to = from - 1; while (g_board[to] == 0) { to--; mob++;}  if (g_board[to] & enemy) mob++;
        to = from + 1; while (g_board[to] == 0) { to++; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 16; while (g_board[to] == 0) { to += 16; mob++; } if (g_board[to] & enemy) mob++;
        to = from - 16; while (g_board[to] == 0) { to -= 16; mob++; } if (g_board[to] & enemy) mob++;
        from = g_pieceList[pieceIdx++];
    }
    result += 25 * mob;

    // Queen mobility
    mob = -2;
    pieceIdx = (color | 5) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        to = from - 15; while (g_board[to] == 0) { to -= 15; mob++; } if (g_board[to] & enemy) mob++;
        to = from - 17; while (g_board[to] == 0) { to -= 17; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 15; while (g_board[to] == 0) { to += 15; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 17; while (g_board[to] == 0) { to += 17; mob++; } if (g_board[to] & enemy) mob++;
        to = from - 1; while (g_board[to] == 0) { to--; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 1; while (g_board[to] == 0) { to++; mob++; } if (g_board[to] & enemy) mob++;
        to = from + 16; while (g_board[to] == 0) { to += 16; mob++; } if (g_board[to] & enemy) mob++;
        to = from - 16; while (g_board[to] == 0) { to -= 16; mob++; } if (g_board[to] & enemy) mob++;
        from = g_pieceList[pieceIdx++];
    }
    result += 22 * mob;

    return result;
}

function Evaluate() {
    var curEval = g_baseEval;

    var evalAdjust = 0;
    // Black queen gone, then cancel white's penalty for king movement
    if (g_pieceList[pieceQueen << 4] == 0)
        evalAdjust -= pieceSquareAdj[pieceKing][g_pieceList[(colorWhite | pieceKing) << 4]];
    // White queen gone, then cancel black's penalty for king movement
    if (g_pieceList[(colorWhite | pieceQueen) << 4] == 0) 
        evalAdjust += pieceSquareAdj[pieceKing][flipTable[g_pieceList[pieceKing << 4]]];

    // Black bishop pair
    if (g_pieceCount[pieceBishop] >= 2)
        evalAdjust -= 500;
    // White bishop pair
    if (g_pieceCount[pieceBishop | colorWhite] >= 2)
        evalAdjust += 500;

    var mobility = Mobility(8) - Mobility(0);

    if (g_toMove == 0) {
        // Black
        curEval -= mobility;
        curEval -= evalAdjust;
    }
    else {
        curEval += mobility;
        curEval += evalAdjust;
    }
    
    return curEval;
}

var historyTable = new Array(32);

function ScoreMove(move){
    var captured = (move >> 16) & 0x7;
    var piece = g_board[move & 0xFF];
    var score;
    if (captured != 0) {
        var pieceType = piece & 0x7;
        score = (captured << 5) - pieceType;
    } else {
        score = historyTable[piece & 0xF][(move >> 8) & 0xFF];
    }
    return score;
}

function QSearch(alpha, beta, ply) {
    var checkStopDepth = -3;

    g_qNodeCount++;

    //var realEval = g_inCheck ? (minEval + 1) : Evaluate();
    var realEval = Evaluate();
    
    if (realEval >= beta) 
        return realEval;

    if (realEval > alpha)
        alpha = realEval;

    var moves = new Array();
    var moveScores = new Array();
    var wasInCheck = g_inCheck;

    /*if (ply == 0 || (wasInCheck && ply >= checkStopDepth)) {
        // TODO: Fast check escape generator and fast checking moves generator
        GenerateCaptureMoves(moves, null);
        GenerateAllMoves(moves);

        for (var i = 0; i < moves.length; i++) {
            moveScores[i] = ScoreMove(moves[i]);
        }
    } else */{
        GenerateCaptureMoves(moves, null);

        for (var i = 0; i < moves.length; i++) {
            var captured = (moves[i] >> 16) & 0x7;
            var pieceType = g_board[moves[i] & 0xFF] & 0x7;

            moveScores[i] = (captured << 5) - pieceType;
        }
    }

    for (var i = 0; i < moves.length; i++) {
        var bestMove = i;
        for (var j = moves.length - 1; j > i; j--) {
            if (moveScores[j] > moveScores[bestMove]) {
                bestMove = j;
            }
        }
        {
            var tmpMove = moves[i];
            moves[i] = moves[bestMove];
            moves[bestMove] = tmpMove;
            
            var tmpScore = moveScores[i];
            moveScores[i] = moveScores[bestMove];
            moveScores[bestMove] = tmpScore;
        }

        if (!MakeMove(moves[i])) {
            continue;
        }

/*        if (ply == 0 && !wasInCheck) {
            // Search captures and checks at ply 0 of q-search
            if (!(g_inCheck || (moves[i] & 0xFF0000))) {
                UnmakeMove(moves[i]);
                continue;
            }
        }*/

        var value = -QSearch(-beta, -alpha, ply - 1);
        
        UnmakeMove(moves[i]);
        
        if (value > realEval) {
            if (value >= beta) 
                return value;
            
            if (value > alpha)
                alpha = value;
            
            realEval = value;
        }
    }

    return realEval;
}

function StoreHash(value, flags, ply, move, force){
	var hashNode = g_hashTable[g_hashKey & g_hashMask];
	if (hashNode == null || ply >= hashNode.ply || force) {
		g_hashTable[g_hashKey & g_hashMask] = new HashEntry(g_hashKey, value, flags, ply, move);
	}
}

function IsHashMoveValid(hashMove) {
    // Do some basic sanity checks
    var from = hashMove & 0xFF;
    var to = (hashMove >> 8) & 0xFF;
    var ourPiece = g_board[from];
    var pieceType = ourPiece & 0x7;
    if (pieceType < piecePawn || pieceType > pieceKing) return false;
    if ((ourPiece & colorWhite) != 0) {
        if (g_toMove != colorWhite) return false;
    } else {
        if (g_toMove == colorWhite) return false;
    }
    if (g_inCheck) return false;
    if (g_board[to] != ((hashMove >> 16) & 0xFF)) return false;
    if (hashMove >> 24) return false;
    if (pieceType == piecePawn) {
        // TODO - This handles pawn captures, but not pawn pushes
        return IsSquareAttackableFrom(to, from);
    } else {
        // This validates that this piece type can actually make the attack
        return IsSquareAttackableFrom(to, from);
    }
}

function IsRepDraw() {
    var stop = g_moveCount - 1 - g_move50;
    stop = stop < 0 ? 0 : stop;
    for (var i = g_moveCount - 5; i >= stop; i -= 2) {
        if (g_repMoveStack[i] == g_hashKey)
            return true;
    }
    return false;
}

function MovePicker(hashMove, depth, killer1, killer2) {
    this.hashMove = hashMove;
    this.depth = depth;
    this.killer1 = killer1;
    this.killer2 = killer2;

    this.moves = new Array();
    this.moveCount = 0;
    this.atMove = -1;
    this.moveScores = null;
    this.stage = 0;

    this.nextMove = function () {
        if (++this.atMove == this.moveCount) {
            this.stage++;
            if (this.stage == 1) {
                if (this.hashMove != null && IsHashMoveValid(hashMove)) {
                    this.moves[0] = hashMove;
                    this.moveCount = 1;
                }
                if (this.moveCount != 1) {
                    this.hashMove = null;
                    this.stage++;
                }
            }

            if (this.stage == 2) {
                GenerateCaptureMoves(this.moves, null);
                this.moveCount = this.moves.length;
                this.moveScores = new Array(this.moveCount);
                // Move ordering
                for (var i = this.atMove; i < this.moveCount; i++) {
                    var captured = (this.moves[i] >> 16) & 0x7;
                    var pieceType = g_board[this.moves[i] & 0xFF] & 0x7;
                    this.moveScores[i] = (captured << 5) - pieceType;
                }
                // No moves, onto next stage
                if (this.atMove == this.moveCount) this.stage++;
            }

            if (this.stage == 3) {
                if (IsHashMoveValid(this.killer1) &&
                    this.killer1 != this.hashMove) {
                    this.moves[this.moves.length] = this.killer1;
                    this.moveCount = this.moves.length;
                } else {
                    this.killer1 = 0;
                    this.stage++;
                }
            }

            if (this.stage == 4) {
                if (IsHashMoveValid(this.killer2) &&
                    this.killer2 != this.hashMove) {
                    this.moves[this.moves.length] = this.killer2;
                    this.moveCount = this.moves.length;
                } else {
                    this.killer2 = 0;
                    this.stage++;
                }
            }

            if (this.stage == 5) {
                GenerateAllMoves(this.moves);
                this.moveCount = this.moves.length;
                // Move ordering
                for (var i = this.atMove; i < this.moveCount; i++) this.moveScores[i] = ScoreMove(this.moves[i]);
                // No moves, onto next stage
                if (this.atMove == this.moveCount) this.stage++;
            }

            if (this.stage == 6)
                return 0;
        }

        var bestMove = this.atMove;
        for (var j = this.atMove + 1; j < this.moveCount; j++) {
            if (this.moveScores[j] > this.moveScores[bestMove]) {
                bestMove = j;
            }
        }

        if (bestMove != this.atMove) {
            var tmpMove = this.moves[this.atMove];
            this.moves[this.atMove] = this.moves[bestMove];
            this.moves[bestMove] = tmpMove;

            var tmpScore = this.moveScores[this.atMove];
            this.moveScores[this.atMove] = this.moveScores[bestMove];
            this.moveScores[bestMove] = tmpScore;
        }

        var candidateMove = this.moves[this.atMove];
        if ((this.stage > 1 && candidateMove == this.hashMove) ||
            (this.stage > 3 && candidateMove == this.killer1) ||
            (this.stage > 4 && candidateMove == this.killer2)) {
            return this.nextMove();
        }

        return this.moves[this.atMove];
    }
}

function AllCutNode(ply, depth, beta, allowNull) {
    if (ply <= 0) {
        return QSearch(beta - 1, beta, 0);
    }

    if ((g_nodeCount & 127) == 127) {
        if ((new Date()).getTime() - g_startTime > g_timeout) {
            // Time cutoff
            g_searchValid = false;
            return beta - 1;
        }
    }

    g_nodeCount++;

    if (IsRepDraw())
        return 0;

    var hashMove = null;
    var hashNode = g_hashTable[g_hashKey & g_hashMask];
    if (hashNode != null && hashNode.lock == g_hashKey) {
        hashMove = hashNode.bestMove;
        if (hashNode.hashDepth >= ply) {
            if (hashNode.flags == hashflagExact)
                return hashNode.value;
            if (hashNode.flags == hashflagAlpha && hashNode.value < beta)
                return beta - 1;
            if (hashNode.flags == hashflagBeta && hashNode.value >= beta)
                return beta;
        }
    }

    // TODO - positional gain?

    if (!g_inCheck &&
        allowNull &&
        beta > minMateBuffer && 
        beta < maxMateBuffer) {
        // Try some razoring
        if (hashMove == null &&
            ply < 4) {
            var razorMargin = 2500 + 200 * ply;
            if (g_baseEval < beta - razorMargin) {
                var razorBeta = beta - razorMargin;
                var v = QSearch(razorBeta - 1, razorBeta, 0);
                if (v < razorBeta)
                    return v;
            }
        }
        
        // TODO - static null move

        // Null move
        if (ply > 1 &&
            g_baseEval >= beta - (ply >= 4 ? 2500 : 0)) {
            var r = 3 + (ply >= 5 ? 1 : ply / 4);
            if (g_baseEval - beta > 1500) r++;

	        g_toMove = 8 - g_toMove;
	        g_baseEval = -g_baseEval;
	        if (g_toMove)
	            g_hashKey -= g_zobristBlack;
	        else 
	            g_hashKey += g_zobristBlack;
			
	        var value = -AllCutNode(ply - r, depth + 1, -(beta - 1), false);

	        if (g_toMove)
	            g_hashKey += g_zobristBlack;
	        else 
	            g_hashKey -= g_zobristBlack;
	        g_toMove = 8 - g_toMove;
	        g_baseEval = -g_baseEval;

            if (value >= beta)
	            return beta;
        }
    }

    var moveMade = false;
    var realEval = minEval;

    var movePicker = new MovePicker(hashMove, depth, g_killers[depth][0], g_killers[depth][1]);

    for (;;) {
        var currentMove = movePicker.nextMove();
        if (currentMove == 0) {
            break;
        }

        var plyToSearch = ply - 1;

        if (!MakeMove(currentMove)) {
            continue;
        }

        var value;
        var doFullSearch = true;

        if (g_inCheck) {
            // Check extensions
            plyToSearch++;
        } else {
            // Late move reductions
            if (movePicker.stage == 5 && movePicker.atMove > 5 && ply >= 3) {
                var reduced = plyToSearch - (movePicker.atMove > 14 ? 2 : 1);
                value = -AllCutNode(reduced, depth + 1, -(beta - 1), true);
                doFullSearch = (value >= beta);
            }
        }

        if (doFullSearch) {
            value = -AllCutNode(plyToSearch, depth + 1, -(beta  - 1), true);
        }

        moveMade = true;

        UnmakeMove(currentMove);

        if (!g_searchValid) {
            return beta - 1;
        }

        if (value > realEval) {
            if (value >= beta) {
				var histTo = (currentMove >> 8) & 0xFF;
				if (g_board[histTo] == 0) {
				    var histPiece = g_board[currentMove & 0xFF] & 0xF;
				    historyTable[histPiece][histTo] += ply * ply;
				    if (historyTable[histPiece][histTo] > 32767) {
				        historyTable[histPiece][histTo] >>= 1;
				    }

				    if (g_killers[depth][0] != currentMove) {
				        g_killers[depth][1] = g_killers[depth][0];
				        g_killers[depth][0] = currentMove;
				    }
				}

                StoreHash(value, hashflagBeta, ply, currentMove, false);
                return value;
            }

            realEval = value;
            hashMove = currentMove;
        }
    }

    if (!moveMade) {
        // If we have no valid moves it's either stalemate or checkmate
        if (g_inCheck)
            // Checkmate.
            return minEval + 1;
        else 
            // Stalemate
            return 0;
    }

    StoreHash(realEval, hashflagAlpha, ply, hashMove, false);
    
    return realEval;
}

function AlphaBeta(ply, depth, alpha, beta) {	
    if (ply <= 0) {
        return QSearch(alpha, beta, 0);
    }

    g_nodeCount++;

    if (IsRepDraw())
        return 0;

    var hashMove = null;
    var hashFlag = hashflagAlpha;
    var hashNode = g_hashTable[g_hashKey & g_hashMask];
    if (hashNode != null && hashNode.lock == g_hashKey) {
        hashMove = hashNode.bestMove;
    }
    
    var inCheck = g_inCheck;

    var moveMade = false;
    var realEval = minEval;

    var movePicker = new MovePicker(hashMove, depth, g_killers[depth][0], g_killers[depth][1]);

    for (;;) {
        var currentMove = movePicker.nextMove();
        if (currentMove == 0) {
            break;
        }

        var plyToSearch = ply - 1;

        if (!MakeMove(currentMove)) {
            continue;
        }

        if (g_inCheck) {
            // Check extensions
            plyToSearch++;
        }

        var value;
        if (moveMade) {
            value = -AllCutNode(plyToSearch, depth + 1, -alpha, true);
            if (value > alpha) {
                value = -AlphaBeta(plyToSearch, depth + 1, -beta, -alpha);
            }
        } else {
            value = -AlphaBeta(plyToSearch, depth + 1, -beta, -alpha);
        }

        moveMade = true;

        UnmakeMove(currentMove);

        if (!g_searchValid) {
            return alpha;
        }

        if (value > realEval) {
            if (value >= beta) {
                var histTo = (currentMove >> 8) & 0xFF;
                if (g_board[histTo] == 0) {
                    var histPiece = g_board[currentMove & 0xFF] & 0xF;
                    historyTable[histPiece][histTo] += ply * ply;
                    if (historyTable[histPiece][histTo] > 32767) {
                        historyTable[histPiece][histTo] >>= 1;
                    }

                    if (g_killers[depth][0] != currentMove) {
                        g_killers[depth][1] = g_killers[depth][0];
                        g_killers[depth][0] = currentMove;
                    }
                }

                StoreHash(value, hashflagBeta, ply, currentMove, false);
                return value;
            }

            if (value > alpha) {
                hashFlag = hashflagExact;
                alpha = value;
            }

            realEval = value;
            hashMove = currentMove;
        }
    }

    if (!moveMade) {
        // If we have no valid moves it's either stalemate or checkmate
        if (inCheck) 
            // Checkmate.
            return minEval + 1;
        else 
            // Stalemate
            return 0;
    }

    StoreHash(realEval, hashFlag, ply, hashMove, true);
    
    return realEval;
}

// 
// Board code
//

// This somewhat funky scheme means that a piece is indexed by it's lower 4 bits when accessing in arrays.  The fifth bit (black bit)
// is used to allow quick edge testing on the board.
var colorBlack = 0x10;
var colorWhite = 0x08;

var pieceEmpty = 0x00;
var piecePawn = 0x01;
var pieceKnight = 0x02;
var pieceBishop = 0x03;
var pieceRook = 0x04;
var pieceQueen = 0x05;
var pieceKing = 0x06;

var g_vectorDelta = new Array(256);

var g_bishopDeltas = [-15, -17, 15, 17];
var g_knightDeltas = [31, 33, 14, -14, -31, -33, 18, -18];
var g_rookDeltas = [-1, +1, -16, +16];
var g_queenDeltas = [-1, +1, -15, +15, -17, +17, -16, +16];

var g_castleRightsMask = [
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
0, 0, 0, 0, 7,15,15,15, 3,15,15,11, 0, 0, 0, 0,
0, 0, 0, 0,15,15,15,15,15,15,15,15, 0, 0, 0, 0,
0, 0, 0, 0,15,15,15,15,15,15,15,15, 0, 0, 0, 0,
0, 0, 0, 0,15,15,15,15,15,15,15,15, 0, 0, 0, 0,
0, 0, 0, 0,15,15,15,15,15,15,15,15, 0, 0, 0, 0,
0, 0, 0, 0,15,15,15,15,15,15,15,15, 0, 0, 0, 0,
0, 0, 0, 0,15,15,15,15,15,15,15,15, 0, 0, 0, 0,
0, 0, 0, 0,13,15,15,15,12,15,15,14, 0, 0, 0, 0,
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

var moveflagEP = 0x1 << 24;
var moveflagEPC = 0x2 << 24;
var moveflagCastleKing = 0x4 << 24;
var moveflagCastleQueen = 0x8 << 24;
var moveflagPromotion = 0x10 << 24;
var moveflagPromoteKnight = 0x20 << 24;
var moveflagPromoteQueen = 0x40 << 24;
var moveflagPromoteBishop = 0x80 << 24;

var g_randa = 1103515245, g_randc = 12345, g_rands = 0x1BADF00D;
function getRandomInt() {
    g_rands = (g_randa * g_rands + g_randc) & 0xFFFFFFFF;
    return g_rands;
} 

function getRandomLong(){
    return (getRandomInt() * (1024 * 256)) + getRandomInt();
}

// Position variables
var g_board = new Array(256); // Sentinel 0x80, pieces are in low 4 bits, 0x8 for color, 0x7 bits for piece type
var g_toMove; // side to move, 0 or 8, 0 = black, 8 = white
var g_castleRights; // bitmask representing castling rights, 1 = wk, 2 = wq, 4 = bk, 8 = bq
var g_enPassentSquare;
var g_baseEval;
var g_hashKey;
var g_inCheck;

// Utility variables
var g_moveCount = 0;
var g_moveUndoStack = new Array();

var g_move50 = 0;
var g_repMoveStack = new Array();

var g_hashSize = 1 << 22;
var g_hashMask = g_hashSize - 1;
var g_hashTable;

var g_killers;

var g_zobrist;
var g_zobristBlack;

// Evaulation variables
var g_mobUnit;

function State() {
    this.board = new Array(256);
    for (var i = 0; i < 256; i++) 
        this.board[i] = g_board[i];
    this.toMove = g_toMove;
    this.castleRights = g_castleRights;
    this.enPassentSquare = g_enPassentSquare;
    this.baseEval = g_baseEval;
    this.hashKey = g_hashKey;
    this.inCheck = g_inCheck;
}

function DebugValidate() {
    // Validate that pieceLists are correct
    for (var piece = 0; piece < 0xF; piece++) {
        for (var i = 0; i < g_pieceCount[piece]; i++) { 
            var boardPiece = piece < 0x8 ? (piece | colorBlack) : piece;
            if (g_pieceList[(piece << 4) | i] == 0)
                return 1;
            if (g_board[g_pieceList[(piece << 4) | i]] != boardPiece)
                return 2;
        }
        for (var i = g_pieceCount[piece]; i < 16; i++) {
            if (g_pieceList[(piece << 4) | i] != 0)
                return 3;
        }
    }

    // Validate that board matches pieceList
    for (var i = 0; i < 256; i++) {
        var row = i >> 4;
        var col = i & 0xF;
        if (row >= 2 && row < 10 && col >= 4 && col < 12) {
            if (!(g_board[i] == 0 ||
                (g_board[i] & (colorBlack | colorWhite)) != 0)) {
                return 4;
            } else if (g_board[i] != 0) {
                if (g_pieceList[((g_board[i] & 0xF) << 4) | g_pieceIndex[i]] != i)
                    return 6;
            }
        } else {
            if (g_board[i] != 0x80)
                return 5;
        }
    }

    if (SetHash() != g_hashKey) {
        return 6;
    }

    return 0;
}

State.prototype.CompareTo = function (other) {
    for (var i = 0; i < 256; i++)
        if (this.board[i] != other.board[i])
            return 1;
    if (this.toMove != other.toMove)
        return 3;
    if (this.castleRights != other.castleRights)
        return 4;
    if (this.enPassentSquare != other.enPassentSquare)
        return 5;
    if (this.baseEval != other.baseEval)
        return 6;
    if (this.hashKey != other.hashKey)
        return 7;
    if (this.inCheck != other.inCheck)
        return 8;
    return 0;
}

var hashflagAlpha = 1;
var hashflagBeta = 2;
var hashflagExact = 3;

function HashEntry(lock, value, flags, hashDepth, bestMove, globalPly) {
    this.lock = lock;
    this.value = value;
    this.flags = flags;
    this.hashDepth = hashDepth;
    this.bestMove = bestMove;
}

function MakeSquare(row, column) {
    return ((row + 2) << 4) | (column + 4);
}

function MakeTable(table) {
    var result = new Array(256);
    for (var i = 0; i < 256; i++) {
        result[i] = 0;
    }
    for (var row = 0; row < 8; row++) {
        for (var col = 0; col < 8; col++) {
            result[MakeSquare(row, col)] = table[row * 8 + col];
        }
    }
    return result;
}

function ResetGame() {
    g_killers = new Array(128);
    for (var i = 0; i < 128; i++) {
        g_killers[i] = [0, 0];
    }

    g_hashTable = new Array(g_hashSize);

    for (var i = 0; i < 32; i++) {
        historyTable[i] = new Array(256);
        for (var j = 0; j < 256; j++)
            historyTable[i][j] = 0;
    }
    g_zobrist = new Array(256);
    for (var i = 0; i < 256; i++) {
        g_zobrist[i] = new Array(16);
        for (var j = 0; j < 16; j++) {
            g_zobrist[i][j] = getRandomLong();
        }
    }
    g_zobristBlack = getRandomLong();

    for (var row = 0; row < 8; row++) {
        for (var col = 0; col < 8; col++) {
            var square = MakeSquare(row, col);
            flipTable[square] = MakeSquare(7 - row, col);
        }
    }

    pieceSquareAdj[piecePawn] = MakeTable(pawnAdj);
    pieceSquareAdj[pieceKnight] = MakeTable(knightAdj);
    pieceSquareAdj[pieceBishop] = MakeTable(bishopAdj);
    pieceSquareAdj[pieceRook] = MakeTable(rookAdj);
    pieceSquareAdj[pieceQueen] = MakeTable(emptyAdj);
    pieceSquareAdj[pieceKing] = MakeTable(kingAdj);

    var pieceDeltas = [[], [], g_knightDeltas, g_bishopDeltas, g_rookDeltas, g_queenDeltas, g_queenDeltas];

    for (var i = 0; i < 256; i++) {
        g_vectorDelta[i] = new Object();
        g_vectorDelta[i].delta = 0;
        g_vectorDelta[i].pieceMask = new Array(2);
        g_vectorDelta[i].pieceMask[0] = 0;
        g_vectorDelta[i].pieceMask[1] = 0;
    }
    
    // Initialize the vector delta table    
    for (var row = 0; row < 0x80; row += 0x10) 
        for (var col = 0; col < 0x8; col++) {
            var square = row | col;
            
            // Pawn moves
            var index = square - (square - 17) + 128;
            g_vectorDelta[index].pieceMask[colorWhite >> 3] |= (1 << piecePawn);
            index = square - (square - 15) + 128;
            g_vectorDelta[index].pieceMask[colorWhite >> 3] |= (1 << piecePawn);
            
            index = square - (square + 17) + 128;
            g_vectorDelta[index].pieceMask[0] |= (1 << piecePawn);
            index = square - (square + 15) + 128;
            g_vectorDelta[index].pieceMask[0] |= (1 << piecePawn);
            
            for (var i = pieceKnight; i <= pieceKing; i++) {
                for (var dir = 0; dir < pieceDeltas[i].length; dir++) {
                    var target = square + pieceDeltas[i][dir];
                    while (!(target & 0x88)) {
                        index = square - target + 128;
                        
                        g_vectorDelta[index].pieceMask[colorWhite >> 3] |= (1 << i);
                        g_vectorDelta[index].pieceMask[0] |= (1 << i);
                        
                        var flip = -1;
                        if (square < target) 
                            flip = 1;
                        
                        if ((square & 0xF0) == (target & 0xF0)) {
                            // On the same row
                            g_vectorDelta[index].delta = flip * 1;
                        } else if ((square & 0x0F) == (target & 0x0F)) {
                            // On the same column
                            g_vectorDelta[index].delta = flip * 16;
                        } else if ((square % 15) == (target % 15)) {
                            g_vectorDelta[index].delta = flip * 15;
                        } else if ((square % 17) == (target % 17)) {
                            g_vectorDelta[index].delta = flip * 17;
                        }

                        if (i == pieceKnight) {
                            g_vectorDelta[index].delta = pieceDeltas[i][dir];
                            break;
                        }

                        if (i == pieceKing)
                            break;

                        target += pieceDeltas[i][dir];
                    }
                }
            }
        }

    InitializeEval();
    InitializeFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

function InitializeEval() {
    g_mobUnit = new Array(2);
    for (var i = 0; i < 2; i++) {
        g_mobUnit[i] = new Array();
        var enemy = i == 0 ? 0x10 : 8;
        var friend = i == 0 ? 8 : 0x10;
        g_mobUnit[i][0] = 1;
        g_mobUnit[i][0x80] = 0;
        g_mobUnit[i][enemy | piecePawn] = 1;
        g_mobUnit[i][enemy | pieceBishop] = 1;
        g_mobUnit[i][enemy | pieceKnight] = 1;
        g_mobUnit[i][enemy | pieceRook] = 1;
        g_mobUnit[i][enemy | pieceQueen] = 1;
        g_mobUnit[i][enemy | pieceKing] = 1;
        g_mobUnit[i][friend | piecePawn] = 0;
        g_mobUnit[i][friend | pieceBishop] = 0;
        g_mobUnit[i][friend | pieceKnight] = 0;
        g_mobUnit[i][friend | pieceRook] = 0;
        g_mobUnit[i][friend | pieceQueen] = 0;
        g_mobUnit[i][friend | pieceKing] = 0;
    }
}

function SetHash(){
    var hashKey = 0;
    for (var i = 0; i < 256; i++) {
        var piece = g_board[i];
        if (piece & 0x18) {
            hashKey += g_zobrist[i][piece & 0xF];
        }
    }
    
    if (!g_toMove) 
        hashKey += g_zobristBlack;
    return hashKey;
}

function InitializeFromFen(fen){
    var chunks = fen.split(' ');
    
    for (var i = 0; i < 256; i++) 
        g_board[i] = 0x80;
    
    var row = 0;
    var col = 0;
    
    var pieces = chunks[0];
    for (var i = 0; i < pieces.length; i++) {
        var c = pieces.charAt(i);
        
        if (c == '/') {
            row++;
            col = 0;
        }
        else {
            if (c >= '0' && c <= '9') {
                for (var j = 0; j < parseInt(c); j++) {
                    g_board[((row + 2) * 0x10) + (col + 4)] = 0;
                    col++;
                }
            }
            else {
                var isBlack = c >= 'a' && c <= 'z';
                var piece = isBlack ? colorBlack : colorWhite;
                if (!isBlack) 
                    c = pieces.toLowerCase().charAt(i);
                switch (c) {
                    case 'p':
                        piece |= piecePawn;
                        break;
                    case 'b':
                        piece |= pieceBishop;
                        break;
                    case 'n':
                        piece |= pieceKnight;
                        break;
                    case 'r':
                        piece |= pieceRook;
                        break;
                    case 'q':
                        piece |= pieceQueen;
                        break;
                    case 'k':
                        piece |= pieceKing;
                        break;
                }
                
                g_board[((row + 2) * 0x10) + (col + 4)] = piece;
                col++;
            }
        }
    }
    
    InitializePieceList();
    
    g_toMove = chunks[1].charAt(0) == 'w' ? colorWhite : 0;
    
    g_castleRights = 0;
    if (chunks[2].indexOf('K') != -1) 
        g_castleRights |= 1;
    if (chunks[2].indexOf('Q') != -1) 
        g_castleRights |= 2;
    if (chunks[2].indexOf('k') != -1) 
        g_castleRights |= 4;
    if (chunks[2].indexOf('q') != -1) 
        g_castleRights |= 8;
    
    g_enPassentSquare = -1;
    if (chunks[3].indexOf('-') == -1) {
        g_enPassentSquare = parseInt(chunks[3], 16);
    }

    g_hashKey = SetHash();

    g_baseEval = 0;
    for (var i = 0; i < 256; i++) {
        if (g_board[i] & colorWhite) {
            g_baseEval += pieceSquareAdj[g_board[i] & 0x7][i];
        } else if (g_board[i] & colorBlack) {
            g_baseEval -= pieceSquareAdj[g_board[i] & 0x7][flipTable[i]];
        }
    }

    g_move50 = 0;
    g_inCheck = IsSquareAttackable(g_pieceList[(g_toMove | pieceKing) << 4], 8 - g_toMove);
}

var g_pieceIndex = new Array(256);
var g_pieceList = new Array(2 * 8 * 16);
var g_pieceCount = new Array(2 * 8);

function InitializePieceList() {
    for (var i = 0; i < 16; i++) {
        g_pieceCount[i] = 0;
        for (var j = 0; j < 16; j++) {
            // 0 is used as the terminator for piece lists
            g_pieceList[(i << 4) | j] = 0;
        }
    }

    for (var i = 0; i < 256; i++) {
        g_pieceIndex[i] = 0;
        if (g_board[i] & (colorWhite | colorBlack)) {
			var piece = g_board[i] & 0xF;

			g_pieceList[(piece << 4) | g_pieceCount[piece]] = i;
			g_pieceIndex[i] = g_pieceCount[piece];
			g_pieceCount[piece]++;
        }
    }
}

function MakeMove(move){
    var me = g_toMove >> 3;
	var otherColor = 8 - g_toMove; 
    
    g_enPassentSquare = -1;
    
    var flags = move & 0xFF000000;
    var captured = (move >> 16) & 0xFF;
    var to = (move >> 8) & 0xFF;
    var from = move & 0xFF;
    var piece = g_board[from];
    var epcEnd = to;

    g_moveUndoStack[g_moveCount] = new UndoHistory(g_enPassentSquare, g_castleRights, g_inCheck, g_baseEval, g_hashKey, g_move50);
    g_moveCount++;

    if (flags) {
        if (flags & moveflagEP) {
            if (me) 
                g_enPassentSquare = to + 0x10;
            else 
                g_enPassentSquare = to - 0x10;
        }
        else if (flags & moveflagEPC) {
            if (me) 
                epcEnd = to + 0x10;
            else 
                epcEnd = to - 0x10;

            g_board[epcEnd] = pieceEmpty;
        } else if (flags & moveflagCastleKing) {
            if (IsSquareAttackable(from + 1, otherColor) ||
            	IsSquareAttackable(from + 2, otherColor)) {
                g_moveCount--;
                return false;
            }
            
            var rook = g_board[to + 1];
            
            g_hashKey -= g_zobrist[to + 1][rook & 0xF];
            g_hashKey += g_zobrist[to - 1][rook & 0xF];
            
            g_board[to - 1] = rook;
            g_board[to + 1] = pieceEmpty;
            
            g_baseEval -= pieceSquareAdj[rook & 0x7][me == 0 ? flipTable[to + 1] : (to + 1)];
            g_baseEval += pieceSquareAdj[rook & 0x7][me == 0 ? flipTable[to - 1] : (to - 1)];

            var rookIndex = g_pieceIndex[to + 1];
            g_pieceIndex[to - 1] = rookIndex;
            g_pieceList[((rook & 0xF) << 4) | rookIndex] = to - 1;
        } else if (flags & moveflagCastleQueen) {
            if (IsSquareAttackable(from - 1, otherColor) ||
            	IsSquareAttackable(from - 2, otherColor)) {
                g_moveCount--;
                return false;
            }
            
            var rook = g_board[to - 2];
            
            g_hashKey -= g_zobrist[to - 2][rook & 0xF];
            g_hashKey += g_zobrist[to + 1][rook & 0xF];
            
            g_board[to + 1] = rook;
            g_board[to - 2] = pieceEmpty;
            
            g_baseEval -= pieceSquareAdj[rook & 0x7][me == 0 ? flipTable[to - 2] : (to - 2)];
            g_baseEval += pieceSquareAdj[rook & 0x7][me == 0 ? flipTable[to + 1] : (to + 1)];

            var rookIndex = g_pieceIndex[to - 2];
            g_pieceIndex[to + 1] = rookIndex;
            g_pieceList[((rook & 0xF) << 4) | rookIndex] = to + 1;
        }
    }

    if (captured) {
        // Remove our piece from the piece list
        var capturedType = captured & 0xF;
        g_pieceCount[capturedType]--;
        var lastPieceSquare = g_pieceList[(capturedType << 4) | g_pieceCount[capturedType]];
        g_pieceIndex[lastPieceSquare] = g_pieceIndex[epcEnd];
        g_pieceList[(capturedType << 4) | g_pieceIndex[lastPieceSquare]] = lastPieceSquare;
        g_pieceList[(capturedType << 4) | g_pieceCount[capturedType]] = 0;

        g_baseEval += materialTable[captured & 0x7];
        g_baseEval += pieceSquareAdj[captured & 0x7][me ? flipTable[epcEnd] : epcEnd];

        g_hashKey -= g_zobrist[epcEnd][capturedType];
        g_move50 = 0;
    } else if ((piece & 0x7) == piecePawn) {
        g_move50 = 0;
    }

    g_hashKey -= g_zobrist[from][piece & 0xF];
    g_hashKey += g_zobrist[to][piece & 0xF];
    if (g_toMove) {
        g_hashKey += g_zobristBlack;
    }
    else {
        g_hashKey -= g_zobristBlack;
    }
    
    g_castleRights &= g_castleRightsMask[from] & g_castleRightsMask[to];

    g_baseEval -= pieceSquareAdj[piece & 0x7][me == 0 ? flipTable[from] : from];
    
    // Move our piece in the piece list
    g_pieceIndex[to] = g_pieceIndex[from];
    g_pieceList[((piece & 0xF) << 4) | g_pieceIndex[to]] = to;

    if (flags & moveflagPromotion) {
        var newPiece = piece & (~0x7);
        if (flags & moveflagPromoteKnight) 
            newPiece |= pieceKnight;
        else if (flags & moveflagPromoteQueen) 
            newPiece |= pieceQueen;
        else if (flags & moveflagPromoteBishop) 
            newPiece |= pieceBishop;
        else 
            newPiece |= pieceRook;
        
        g_hashKey -= g_zobrist[to][piece & 0xF];
        g_board[to] = newPiece;
        g_hashKey += g_zobrist[to][newPiece & 0xF];
        
        g_baseEval += pieceSquareAdj[newPiece & 0x7][me == 0 ? flipTable[to] : to];
        g_baseEval -= materialTable[piecePawn];
        g_baseEval += materialTable[newPiece & 0x7];

        var pawnType = piece & 0xF;
        var promoteType = newPiece & 0xF;

        g_pieceCount[pawnType]--;

        var lastPawnSquare = g_pieceList[(pawnType << 4) | g_pieceCount[pawnType]];
        g_pieceIndex[lastPawnSquare] = g_pieceIndex[to];
        g_pieceList[(pawnType << 4) | g_pieceIndex[lastPawnSquare]] = lastPawnSquare;
        g_pieceList[(pawnType << 4) | g_pieceCount[pawnType]] = 0;
        g_pieceIndex[to] = g_pieceCount[promoteType];
        g_pieceList[(promoteType << 4) | g_pieceIndex[to]] = to;
        g_pieceCount[promoteType]++;
    } else {
        g_board[to] = g_board[from];
        
        g_baseEval += pieceSquareAdj[piece & 0x7][me == 0 ? flipTable[to] : to];
    }
    g_board[from] = pieceEmpty;

    g_toMove = otherColor;
    g_baseEval = -g_baseEval;
    
    if ((piece & 0x7) == pieceKing || g_inCheck) {
        if (IsSquareAttackable(g_pieceList[(pieceKing | (8 - g_toMove)) << 4], otherColor)) {
            UnmakeMove(move);
            return false;
        }
    } else {
        var kingPos = g_pieceList[(pieceKing | (8 - g_toMove)) << 4];
        
        if (ExposesCheck(from, kingPos)) {
            UnmakeMove(move);
            return false;
        }
        
        if (epcEnd != to) {
            if (ExposesCheck(epcEnd, kingPos)) {
                UnmakeMove(move);
                return false;
            }
        }
    }
    
    g_inCheck = false;
    
    if (flags <= moveflagEPC) {
        var theirKingPos = g_pieceList[(pieceKing | g_toMove) << 4];
        
        // First check if the piece we moved can attack the enemy king
        g_inCheck = IsSquareAttackableFrom(theirKingPos, to);
        
        if (!g_inCheck) {
            // Now check if the square we moved from exposes check on the enemy king
            g_inCheck = ExposesCheck(from, theirKingPos);
            
            if (!g_inCheck) {
                // Finally, ep. capture can cause another square to be exposed
                if (epcEnd != to) {
                    g_inCheck = ExposesCheck(epcEnd, theirKingPos);
                }
            }
        }
    }
    else {
        // Castle or promotion, slow check
        g_inCheck = IsSquareAttackable(g_pieceList[(pieceKing | g_toMove) << 4], 8 - g_toMove);
    }

    g_repMoveStack[g_moveCount - 1] = g_hashKey;
    g_move50++;

    return true;
}

function UnmakeMove(move){
    g_toMove = 8 - g_toMove;
    g_baseEval = -g_baseEval;
    
    g_moveCount--;
    g_enPassentSquare = g_moveUndoStack[g_moveCount].ep;
    g_castleRights = g_moveUndoStack[g_moveCount].castleRights;
    g_inCheck = g_moveUndoStack[g_moveCount].inCheck;
    g_baseEval = g_moveUndoStack[g_moveCount].baseEval;
    g_hashKey = g_moveUndoStack[g_moveCount].hashKey;
    g_move50 = g_moveUndoStack[g_moveCount].move50;
    
    var otherColor = 8 - g_toMove;
    var me = g_toMove >> 3;
    var them = otherColor >> 3;
    
    var flags = move & 0xFF000000;
    var captured = (move >> 16) & 0xFF;
    var to = (move >> 8) & 0xFF;
    var from = move & 0xFF;
    
    var piece = g_board[to];
    
    if (flags) {
        if (flags & moveflagCastleKing) {
            var rook = g_board[to - 1];
            g_board[to + 1] = rook;
            g_board[to - 1] = pieceEmpty;
			
            var rookIndex = g_pieceIndex[to - 1];
            g_pieceIndex[to + 1] = rookIndex;
            g_pieceList[((rook & 0xF) << 4) | rookIndex] = to + 1;
        }
        else if (flags & moveflagCastleQueen) {
            var rook = g_board[to + 1];
            g_board[to - 2] = rook;
            g_board[to + 1] = pieceEmpty;
			
            var rookIndex = g_pieceIndex[to + 1];
            g_pieceIndex[to - 2] = rookIndex;
            g_pieceList[((rook & 0xF) << 4) | rookIndex] = to - 2;
        }
    }
    
    if (flags & moveflagPromotion) {
        piece = (g_board[to] & (~0x7)) | piecePawn;
        g_board[from] = piece;

        var pawnType = g_board[from] & 0xF;
        var promoteType = g_board[to] & 0xF;

        g_pieceCount[promoteType]--;

        var lastPromoteSquare = g_pieceList[(promoteType << 4) | g_pieceCount[promoteType]];
        g_pieceIndex[lastPromoteSquare] = g_pieceIndex[to];
        g_pieceList[(promoteType << 4) | g_pieceIndex[lastPromoteSquare]] = lastPromoteSquare;
        g_pieceList[(promoteType << 4) | g_pieceCount[promoteType]] = 0;
        g_pieceIndex[to] = g_pieceCount[pawnType];
        g_pieceList[(pawnType << 4) | g_pieceIndex[to]] = to;
        g_pieceCount[pawnType]++;
    }
    else {
        g_board[from] = g_board[to];
    }
    
    var epcEnd = to;
    if (flags & moveflagEPC) {
        if (g_toMove == colorWhite) 
            epcEnd = to + 0x10;
        else 
            epcEnd = to - 0x10;
        g_board[to] = pieceEmpty;
    }
    
    g_board[epcEnd] = captured;

	// Move our piece in the piece list
    g_pieceIndex[from] = g_pieceIndex[to];
    g_pieceList[((piece & 0xF) << 4) | g_pieceIndex[from]] = from;

    if (captured) {
		// Restore our piece to the piece list
        var captureType = captured & 0xF;
        g_pieceIndex[epcEnd] = g_pieceCount[captureType];
        g_pieceList[(captureType << 4) | g_pieceCount[captureType]] = epcEnd;
        g_pieceCount[captureType]++;
    }
}

function ExposesCheck(from, kingPos){
    var index = kingPos - from + 128;
    // If a queen can't reach it, nobody can!
    if ((g_vectorDelta[index].pieceMask[0] & (1 << (pieceQueen))) != 0) {
        var delta = g_vectorDelta[index].delta;
        var pos = kingPos + delta;
        while (g_board[pos] == 0) pos += delta;
        
        var piece = g_board[pos];
        if (((piece & (g_board[kingPos] ^ 0x18)) & 0x18) == 0)
            return false;

        // Now see if the piece can actually attack the king
        var backwardIndex = pos - kingPos + 128;
        return (g_vectorDelta[backwardIndex].pieceMask[(piece >> 3) & 1] & (1 << (piece & 0x7))) != 0;
    }
    return false;
}

function IsSquareAttackableFrom(target, from){
    var index = from - target + 128;
    var piece = g_board[from];
    if (g_vectorDelta[index].pieceMask[(piece >> 3) & 1] & (1 << (piece & 0x7))) {
        // Yes, this square is pseudo-attackable.  Now, check for real attack
		var inc = g_vectorDelta[index].delta;
        do {
			from += inc;
			if (from == target)
				return true;
		} while (g_board[from] == 0);
    }
    
    return false;
}

function IsSquareAttackable(target, color) {
	// Attackable by pawns?
	var inc = color ? -16 : 16;
	var pawn = (color ? colorWhite : colorBlack) | 1;
	if (g_board[target - (inc - 1)] == pawn)
		return true;
	if (g_board[target - (inc + 1)] == pawn)
		return true;
	
	// Attackable by pieces?
	for (var i = 2; i <= 6; i++) {
        var index = (color | i) << 4;
        var square = g_pieceList[index];
		while (square != 0) {
			if (IsSquareAttackableFrom(target, square))
				return true;
			square = g_pieceList[++index];
		}
    }
    return false;
}

function GenerateMove(from, to, captured){
    return from | (to << 8);
}

function GenerateMove(from, to, captured){
    return from | (to << 8) | (captured << 16);
}

function GenerateMove(from, to, captured, flags) {
    return from | (to << 8) | (captured << 16) | flags;
}

function GenerateValidMoves() {
    var moveList = new Array();
    var allMoves = new Array();
    GenerateCaptureMoves(allMoves, null);
    GenerateAllMoves(allMoves);
    
    for (var i = allMoves.length - 1; i >= 0; i--) {
        if (MakeMove(allMoves[i])) {
            moveList[moveList.length] = allMoves[i];
            UnmakeMove(allMoves[i]);
        }
    }
    
    return moveList;
}

function GenerateAllMoves(moveStack) {
    var from, to, piece, pieceIdx;

	// Pawn quiet moves
    pieceIdx = (g_toMove | 1) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        GeneratePawnMoves(moveStack, from);
        from = g_pieceList[pieceIdx++];
    }

    // Knight quiet moves
	pieceIdx = (g_toMove | 2) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from + 31; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 33; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 14; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 14; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 31; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 33; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 18; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 18; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		from = g_pieceList[pieceIdx++];
	}

	// Bishop quiet moves
	pieceIdx = (g_toMove | 3) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from - 15; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to -= 15; }
		to = from - 17; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to -= 17; }
		to = from + 15; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to += 15; }
		to = from + 17; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to += 17; }
		from = g_pieceList[pieceIdx++];
	}

	// Rook quiet moves
	pieceIdx = (g_toMove | 4) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from - 1; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to--; }
		to = from + 1; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to++; }
		to = from + 16; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to += 16; }
		to = from - 16; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to -= 16; }
		from = g_pieceList[pieceIdx++];
	}
	
	// Queen quiet moves
	pieceIdx = (g_toMove | 5) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from - 15; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to -= 15; }
		to = from - 17; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to -= 17; }
		to = from + 15; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to += 15; }
		to = from + 17; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to += 17; }
		to = from - 1; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to--; }
		to = from + 1; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to++; }
		to = from + 16; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to += 16; }
		to = from - 16; while (g_board[to] == 0) { moveStack[moveStack.length] = GenerateMove(from, to); to -= 16; }
		from = g_pieceList[pieceIdx++];
	}
	
	// King quiet moves
	{
		pieceIdx = (g_toMove | 6) << 4;
		from = g_pieceList[pieceIdx];
		to = from - 15; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 17; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 15; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 17; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 1; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 1; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from - 16; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		to = from + 16; if (g_board[to] == 0) moveStack[moveStack.length] = GenerateMove(from, to);
		
        if (!g_inCheck) {
            var castleRights = g_castleRights;
            if (!g_toMove) 
                castleRights >>= 2;
            if (castleRights & 1) {
                // Kingside castle
                if (g_board[from + 1] == pieceEmpty && g_board[from + 2] == pieceEmpty) {
                    moveStack[moveStack.length] = GenerateMove(from, from + 0x02, pieceEmpty, moveflagCastleKing);
                }
            }
            if (castleRights & 2) {
                // Queenside castle
                if (g_board[from - 1] == pieceEmpty && g_board[from - 2] == pieceEmpty && g_board[from - 3] == pieceEmpty) {
                    moveStack[moveStack.length] = GenerateMove(from, from - 0x02, pieceEmpty, moveflagCastleQueen);
                }
            }
        }
	}
}

function GenerateCaptureMoves(moveStack, moveScores) {
    var from, to, piece, pieceIdx;
    var inc = (g_toMove == 8) ? -16 : 16;
    var enemy = g_toMove == 8 ? 0x10 : 0x8;

    // Pawn captures
    pieceIdx = (g_toMove | 1) << 4;
    from = g_pieceList[pieceIdx++];
    while (from != 0) {
        to = from + inc - 1;
        if (g_board[to] & enemy) {
            MovePawnTo(moveStack, from, to, g_board[to]);
        }

        to = from + inc + 1;
        if (g_board[to] & enemy) {
            MovePawnTo(moveStack, from, to, g_board[to]);
        }

        from = g_pieceList[pieceIdx++];
    }

    if (g_enPassentSquare != -1) {
        var inc = (g_toMove == colorWhite) ? -16 : 16;
        var pawn = g_toMove | piecePawn;

        var from = g_enPassentSquare - (inc + 1);
        if ((g_board[from] & 0xF) == pawn) {
            moveStack[moveStack.length] = GenerateMove(from, g_enPassentSquare, g_board[g_enPassentSquare - inc], moveflagEPC);
        }

        from = g_enPassentSquare - (inc - 1);
        if ((g_board[from] & 0xF) == pawn) {
            moveStack[moveStack.length] = GenerateMove(from, g_enPassentSquare, g_board[g_enPassentSquare - inc], moveflagEPC);
        }
    }

    // Knight captures
	pieceIdx = (g_toMove | 2) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from + 31; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 33; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 14; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 14; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 31; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 33; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 18; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 18; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		from = g_pieceList[pieceIdx++];
	}
	
	// Bishop captures
	pieceIdx = (g_toMove | 3) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from; do { to -= 15; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to -= 17; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to += 15; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to += 17; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		from = g_pieceList[pieceIdx++];
	}
	
	// Rook captures
	pieceIdx = (g_toMove | 4) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from; do { to--; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to++; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to -= 16; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to += 16; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		from = g_pieceList[pieceIdx++];
	}
	
	// Queen captures
	pieceIdx = (g_toMove | 5) << 4;
	from = g_pieceList[pieceIdx++];
	while (from != 0) {
		to = from; do { to -= 15; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to -= 17; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to += 15; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to += 17; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to--; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to++; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to -= 16; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from; do { to += 16; } while (g_board[to] == 0); if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		from = g_pieceList[pieceIdx++];
	}
	
	// King captures
	{
		pieceIdx = (g_toMove | 6) << 4;
		from = g_pieceList[pieceIdx];
		to = from - 15; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 17; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 15; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 17; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 1; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 1; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from - 16; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
		to = from + 16; if (g_board[to] & enemy) moveStack[moveStack.length] = GenerateMove(from, to, g_board[to]);
	}
}

function MovePawnTo(moveStack, start, square, captured) {
	var row = square & 0xF0;
    if ((row == 0x90) || (row == 0x20)) {
        moveStack[moveStack.length] = GenerateMove(start, square, captured, moveflagPromotion | moveflagPromoteQueen);
        moveStack[moveStack.length] = GenerateMove(start, square, captured, moveflagPromotion | moveflagPromoteKnight);
        moveStack[moveStack.length] = GenerateMove(start, square, captured, moveflagPromotion | moveflagPromoteBishop);
        moveStack[moveStack.length] = GenerateMove(start, square, captured, moveflagPromotion);
    }
    else {
        moveStack[moveStack.length] = GenerateMove(start, square, captured, 0);
    }
}

function GeneratePawnMoves(moveStack, from) {
    var piece = g_board[from];
    var color = piece & colorWhite;
    var inc = (color == colorWhite) ? -16 : 16;
    
	// Quiet pawn moves
	var to = from + inc;
	if (g_board[to] == 0) {
		MovePawnTo(moveStack, from, to, pieceEmpty);
		
		// Check if we can do a 2 square jump
		if ((((from & 0xF0) == 0x30) && color != colorWhite) ||
		    (((from & 0xF0) == 0x80) && color == colorWhite)) {
			to += inc;
			if (g_board[to] == 0) {
				moveStack[moveStack.length] = GenerateMove(from, to, pieceEmpty, moveflagEP);
			}				
		}
	}
}

function UndoHistory(ep, castleRights, inCheck, baseEval, hashKey, move50) {
    this.ep = ep;
    this.castleRights = castleRights;
    this.inCheck = inCheck;
    this.baseEval = baseEval;
    this.hashKey = hashKey;
    this.move50 = move50;
}

//////////////////////////////////////////////////
// Test Harness
//////////////////////////////////////////////////
function FinishMoveLocalTesting(bestMove, value, timeTaken, ply) {
    if (bestMove != null) {
        MakeMove(bestMove);
        postMessage(bestMove.toString("16"));
    }
}

var needsReset = true;
onmessage = function (e) {
    if (e.data == "go" || needsReset) {
        ResetGame();
        needsReset = false;
    }
    if (e.data.match("^position") == "position") {
        ResetGame();
        InitializeFromFen(e.data.substr(9, e.data.length - 9));
    } else if (e.data == "search") {
        Search(FinishMoveLocalTesting, 99);
    } else {
        MakeMove(parseInt(e.data, 16));
    }
}