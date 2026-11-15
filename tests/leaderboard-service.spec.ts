
import {test,expect} from "@playwright/test";
import {mockLeaderboardService as service,leaderboardDemo} from "../src/services/mock-leaderboard-service";
import {savedResults} from "../src/services/mock-result-service";
test("top three aggregates saved results only, keeps equal ranks and returns no identifiers",async()=>{
 savedResults.clear(); leaderboardDemo.reset();
 expect((await service.load()).entries).toEqual([]);
 for(const [id,participant,score,day] of [["a","one",80,1],["b","one",90,2],["c","two",100,1],["d","three",100,1],["e","four",0,1]] as const) {
  savedResults.set(id,{attemptId:id,participantIdentifier:participant,gameId:day===1?"mock":String(day),gameTitle:"Test",day,score});
 }
 const rows=(await service.load()).entries;
 expect(rows.map(row=>row.totalScore)).toEqual([170,100,100]);
 expect(rows.map(row=>row.gamesCompleted)).toEqual([2,1,1]);
 expect(rows.map(row=>row.rank)).toEqual([1,2,2]);
 expect(Object.keys(rows[0]).sort()).toEqual(["displayName","gamesCompleted","rank","totalScore"]);
 savedResults.clear();
});
