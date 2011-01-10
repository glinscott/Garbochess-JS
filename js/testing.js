function RunPerft(){
    ResetGame();
	
    for (var i = 0; i < g_perfTTable.length; i++) {
        InitializeFromFen(g_perfTTable[i][0]);
        for (var j = 1; j <= 3; j++) {
			var perftj = Perft(j);
            if (g_perfTTable[i][j] != perftj) {
                alert(g_perfTTable[i][0] + " " + g_perfTTable[i][j] + " " + perftj);
            }
        }
    }
}

function Perft(depth) {
    if (depth == 0) 
        return 1;
	var moves = new Array();
	GenerateCaptureMoves(moves, null);
	GenerateAllMoves(moves);
    var result = 0;
    for (var i = 0; i < moves.length; i++) {
        if (!MakeMove(moves[i])) {
//            if (DebugValidate() != 0) 
//            { alert(moves[i]); }
            continue;
        }
//        if (DebugValidate() != 0)
//       { alert(moves[i]); }
        result += Perft(depth - 1);
        UnmakeMove(moves[i]);
//        if (DebugValidate() != 0)
//       { alert(moves[i]); }
    }
    return result;
}

function DebugCheckMove(hashMove) {
    var moves = new Array();
    GenerateCaptureMoves(moves, null);
    GenerateAllMoves(moves);
    for (var i = 0; i < moves.length; i++) {
        if (moves[i] == hashMove)
            return true;
    }
    return false;
}

function State() {
    this.board = new Array(256);
    for (var i = 0; i < 256; i++)
        this.board[i] = g_board[i];
    this.toMove = g_toMove;
    this.castleRights = g_castleRights;
    this.enPassentSquare = g_enPassentSquare;
    this.baseEval = g_baseEval;
    this.hashKeyLow = g_hashKeyLow;
    this.hashKeyHigh = g_hashKeyHigh;
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

    var hashResult = SetHash();
    if (hashResult.hashKeyLow != g_hashKeyLow ||
        hashResult.hashKeyHigh != g_hashKeyHigh) {
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
    if (this.hashKeyLow != other.hashKeyLow ||
        this.hashKeyHigh != other.hashKeyHigh)
        return 7;
    if (this.inCheck != other.inCheck)
        return 8;
    return 0;
}

function CheckSee(fen, move, expected) {
    InitializeFromFen(fen);
    var captureMove = GetMoveFromString(move);

    var start = new State();
    if (See(captureMove) != expected) {
        alert("busted");
    }
    if (new State().CompareTo(start) != 0) {
        alert("see modified board");
    }

//  assert(position.see_sign(captureMove) == expected); 

  /*Position flipped; 
  flipped.flipped_copy(position); 

  std::string flippedMove(move); 
  flippedMove[1] = '1' + ('8' - flippedMove[1]); 
  flippedMove[3] = '1' + ('8' - flippedMove[3]); 
  captureMove = move_from_string(flipped, flippedMove); 
  assert(move_is_ok(captureMove)); 
  assert(flipped.see_sign(captureMove) == expected); */
} 

function SeeTests() { 
  // Winning pawn capture on rook 
  CheckSee("2r3k1/2r4p/1PNqb1p1/3p1p2/4p3/2Q1P2P/5PP1/1R4K1 w - - 0 37", "b6c7", true); 

  // Winning rook/queen capture on pawn 
  CheckSee("2r3k1/2P4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/1R4K1 b - - 0 37", "c8c7", true);
  CheckSee("2r3k1/2P4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/1R4K1 b - - 0 37", "d6c7", true); 

  // Winning rook/queen capture on knight 
  CheckSee("6k1/2r4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/1R4K1 b - - 0 38", "c7c6", true);
  CheckSee("6k1/2r4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/1R4K1 b - - 0 38", "d6c6", true);
  CheckSee("6k1/2r4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/2B3K1 b - - 0 38", "c7c6", true);

  // Losing rook/queen capture on knight (revealed rook attack) 
  CheckSee("6k1/2r4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/2R3K1 b - - 0 38", "c7c6", false);
  CheckSee("6k1/2r4p/2Nqb1p1/3p1p2/4p3/2Q1P2P/5PP1/2R3K1 b - - 0 38", "d6c6", false); 

  // Winning rook/queen capture on knight (revealed bishop attack) 
  CheckSee("4b1k1/2rq3p/2N3p1/3p1p2/4p3/2Q1P2P/5PP1/2R3K1 b - - 0 38", "c7c6", true);
  CheckSee("4b1k1/2rq3p/2N3p1/3p1p2/4p3/2Q1P2P/5PP1/2R3K1 b - - 0 38", "d7c6", true); 

  // Winning pawn capture on pawn 
  CheckSee("2r3k1/2pq3p/3P2p1/b4p2/4p3/2R1P2P/5PP1/2R3K1 w - - 0 38", "d6c7", true); 

  // Losing rook capture on pawn 
  CheckSee("2r3k1/2pq3p/3P2p1/b4p2/4p3/2R1P2P/5PP1/2R3K1 w - - 0 38", "c3c7", false); 

  // Losing queen capture on rook 
  CheckSee("2r3k1/2p4p/3P2p1/q4p2/4p3/2R1P2P/5PP1/2R3K1 b - - 0 38", "a5c3", false); 

  // Losing rook capture on pawn 
  CheckSee("1br3k1/2p4p/3P2p1/q4p2/4p3/2R1P2P/5PP1/2R3K1 w - - 0 38", "c3c7", false); 

  // Winning Q promotion (non-capture) 
  CheckSee("4rrk1/2P4p/6p1/5p2/4p3/2R1P2P/5PP1/2R3K1 w - - 0 38", "c7c8q", true); 

  // Losing Q promotion (non-capture) 
  //CheckSee("r3rrk1/2P4p/6p1/5p2/4p3/2R1P2P/5PP1/2R3K1 w - - 0 38", "c7c8q", false);

  // Knight capturing pawn defended by pawn 
  CheckSee("K7/8/2p5/3p4/8/4N3/8/7k w - - 0 1", "e3d5", false); 

  // Knight capturing undefended pawn
  CheckSee("K7/8/8/3p4/8/4N3/8/7k w - - 0 1", "e3d5", true);

  // Rook capturing pawn defended by knight 
  CheckSee("K7/4n3/8/3p4/8/3R4/3R4/7k w - - 0 1", "d3d5", false); 

  // Rook capturing pawn defended by bishop 
  CheckSee("K7/5b2/8/3p4/8/3R4/3R4/7k w - - 0 1", "d3d5", false); 

  // Rook capturing knight defended by bishop 
  CheckSee("K7/5b2/8/3n4/8/3R4/3R4/7k w - - 0 1", "d3d5", true); 

  // Rook capturing rook defended by bishop 
  CheckSee("K7/5b2/8/3r4/8/3R4/3R4/7k w - - 0 1", "d3d5", true);
}

