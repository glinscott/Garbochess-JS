"use strict";

/* Initial bench scores:
Ply:5 Score:254 Nodes:11120 NPS:45950  Nc3 d5 d4 Nf6 Bf4
Ply:5 Score:281 Nodes:24707 NPS:51365  Rad8 Nc3 f5 a3 Bd6
Ply:5 Score:741 Nodes:23628 NPS:55334  Qa5 Rd1 b5 Qc3 Qxa2
Ply:5 Score:188 Nodes:32137 NPS:65054  Bd3 Rxf8+ Rxf8 dxe5 Nxe5 Bf4
Ply:5 Score:509 Nodes:9584 NPS:59160  Nxc6 bxc6 Ne7+ Kh8 Nxc6 Qb7
Ply:5 Score:127 Nodes:15516 NPS:52067  a3 Bd7 Rd2 Qe8 Qg5
Ply:5 Score:106 Nodes:8733 NPS:45722  Qxb2 Qd2 Red8 Rab1 Qa3
Ply:5 Score:1155 Nodes:43826 NPS:66202  Bg3 Bg4 f3 Be6 Nxd4
Ply:5 Score:410 Nodes:27018 NPS:43931  Bc2 g6 Qg4 Nc5 Qh4
Ply:5 Score:873 Nodes:15928 NPS:41805  Qg3 Qxe5 Rxg4 Nxg4 Qxg4
Ply:5 Score:-249 Nodes:59916 NPS:72362  Ng4 O-O a6 f5 gxf5
Ply:5 Score:238 Nodes:19851 NPS:65950  Rc1 Bd7 Qd3 Bb6 e5
Ply:5 Score:911 Nodes:19888 NPS:65206  Bd6 Rb2 Rf7 Qh5 Bxc4
Ply:5 Score:-317 Nodes:12639 NPS:63512  Qb5 Bg6 Bg5 f6 Bf4
Ply:5 Score:870 Nodes:31307 NPS:83932  Ra3 R5b2 Ke7 Rc1 Rc8
Ply:5 Score:715 Nodes:8779 NPS:61823  Qe7 Qb1 Qc7 Qc2 Bc6
364577 NPS:59756

Ply:6 Score:13 Nodes:39972 NPS:97255  e4 d5 exd5 Qxd5 Nc3 Qd6
Ply:6 Score:192 Nodes:129475 NPS:116017  Rfd8 a3 Ba5 Nc5 Nxd4 Bxh7+ Kxh7
Ply:6 Score:727 Nodes:58792 NPS:110303  Qa5 a4 a6 Rf1 b5 axb5
Ply:6 Score:127 Nodes:58919 NPS:132700  Bd3 Rxf8+ Rxf8 dxe5 Nxe5 Bf4 Re8
Ply:6 Score:8 Nodes:73180 NPS:113987  Nxc6 bxc6 Ne7+ Kh8 Kb1 Qb7 Nf5
Ply:6 Score:12 Nodes:53598 NPS:95031  a3 Bd7 d4 Nc6 dxe5 Nxe5
Ply:6 Score:17 Nodes:31916 NPS:89651  Qxb2 Qd2 Qb6+ d4 Rad8 e5 Ng4
Ply:6 Score:1220 Nodes:91765 NPS:140743  Bg3 Bd7 Nxd4 Bf6 Re1+ Nge7 Nd6+ Kf8
Ply:6 Score:273 Nodes:40782 NPS:90626  Bc2 g6 Qe2 Nc6 Bh6 Ng7
Ply:6 Score:873 Nodes:30305 NPS:102728  Qg3 Qxe5 Rxg4 Nxg4 Qxg4 Qxb2
Ply:6 Score:-278 Nodes:202802 NPS:120571  Ng4 Qa4 a6 Na7 Bxd5 cxd5
Ply:6 Score:152 Nodes:90124 NPS:97431  a4 Rb8 Qd3 bxa4 Rxa4 Rb5
Ply:6 Score:824 Nodes:59203 NPS:110659  Bd6 Rb2 Ba3 Rb3 Bd6 Qg4
Ply:6 Score:-387 Nodes:33173 NPS:102385  Qb5 Qg4 f3 exf3 Nxf3 Bg6
Ply:6 Score:865 Nodes:75147 NPS:128456  Rg8 a4 g5 Rd1 Rc4 a5
Ply:6 Score:638 Nodes:26820 NPS:98602  Qe7 Qa2 Qc7 f3 Bc6 Qc2
1095973 NPS:111993
*/

var PerfTests = new Object();

PerfTests.g_benchPositions = 
[
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r4rk1/1b2qppp/p1n1p3/1p6/1b1PN3/3BRN2/PP3PPP/R2Q2K1 b - - 7 16",
  "4r1k1/ppq3pp/3b4/2pP4/2Q1p3/4B1P1/PP5P/R5K1 b - - 0 20",
  "4rrk1/pp1n3p/3q2pQ/2p1pb2/2PP4/2P3N1/P2B2PP/4RRK1 b - - 7 19",
  "rq3rk1/ppp2ppp/1bnpb3/3N2B1/3NP3/7P/PPPQ1PP1/2KR3R w - - 7 14",
  "r1bq1r1k/1pp1n1pp/1p1p4/4p2Q/4Pp2/1BNP4/PPP2PPP/3R1RK1 w - - 2 14",
  "r3r1k1/2p2ppp/p1p1bn2/8/1q2P3/2NPQN2/PPP3PP/R4RK1 b - - 2 15",
  "r1bbk1nr/pp3p1p/2n5/1N4p1/2Np1B2/8/PPP2PPP/2KR1B1R w kq - 0 13",
  "r1bq1rk1/ppp1nppp/4n3/3p3Q/3P4/1BP1B3/PP1N2PP/R4RK1 w - - 1 16",
  "4r1k1/r1q2ppp/ppp2n2/4P3/5Rb1/1N1BQ3/PPP3PP/R5K1 w - - 1 17",
  "2rqkb1r/ppp2p2/2npb1p1/1N1Nn2p/2P1PP2/8/PP2B1PP/R1BQK2R b KQ - 0 11",
  "r1bq1r1k/b1p1npp1/p2p3p/1p6/3PP3/1B2NN2/PP3PPP/R2Q1RK1 w - - 1 16",
  "3r1rk1/p5pp/bpp1pp2/8/q1PP1P2/b3P3/P2NQRPP/1R2B1K1 b - - 6 22",
  "r1q2rk1/2p1bppp/2Pp4/p6b/Q1PNp3/4B3/PP1R1PPP/2K4R w - - 2 18",
  "4k2r/1pb2ppp/1p2p3/1R1p4/3P4/2r1PN2/P4PPP/1R4K1 b  - 3 22",
  "3q2k1/pb3p1p/4pbp1/2r5/PpN2N2/1P2P2P/5PP1/Q2R2K1 b - - 4 26"
  ];

PerfTests.finishTest = function (bestMove, value, timeTaken, ply) {
    var totalNodes = g_nodeCount + g_qNodeCount;
    var pv = "Ply:" + ply + " Score:" + value + " Nodes:" + totalNodes + " NPS:" + ((totalNodes / (timeTaken / 1000)) | 0) + " " + PVFromHash(bestMove, 15);
    PerfTests.totalNodes += totalNodes;
    PerfTests.totalTime += timeTaken;

    var pgnTextBox = document.getElementById("PgnTextBox");
    pgnTextBox.value += pv + "\n";
    if (PerfTests.currentTest >= PerfTests.g_benchPositions.length) {
        pgnTextBox.value += PerfTests.totalNodes + " NPS:" + ((PerfTests.totalNodes / (PerfTests.totalTime / 1000)) | 0);
    }
}

PerfTests.currentTest = 0;
PerfTests.totalNodes = 0;
PerfTests.totalTime = 0;

PerfTests.benchmark = function () {
    PerfTests.currentTest = 0;
    PerfTests.totalNodes = 0;
    PerfTests.totalTime = 0;
    ResetGame();
    PerfTests.benchmarkInner();
}

PerfTests.benchmarkInner = function () {
    if (PerfTests.currentTest < PerfTests.g_benchPositions.length)
        setTimeout(function () {
            InitializeFromFen(PerfTests.g_benchPositions[PerfTests.currentTest++]);
            Search(PerfTests.finishTest, 6, null);
            PerfTests.benchmarkInner();
        }, 100);
}