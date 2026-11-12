
import type { AccessService } from "./access-service";
import type { ParticipantService, Participant } from "./participant-service";
import type { EligibilityService } from "./eligibility-service";
import type { AttemptService, GameAttempt } from "./attempt-service";
import type { ResultService, SavedResult } from "./result-service";
import type { LeaderboardService } from "./leaderboard-service";
import { ApiError, createApiClient } from "./backend-client";
import { platformSession } from "./platform-session";
type Student = { id: string; student_number: string; full_name: string };
type Attempt = { id: string; student_id: string; game_id: number; status: "started" | "completed"; score: number | null; play_date: string; started_at: string };
type Game = { id: number; name: string; max_score: number; is_active: boolean; attempt: Attempt | null; eligible_to_start: boolean };
type Progress = { student_id: string; play_date: string; daily_slot_consumed: boolean; total_score: number; games: Game[] };
const validScore = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
export function createBackendServices(base: string, transport: typeof fetch = fetch) {
  const request = createApiClient(base, transport);
  const gameNames = new Map<number,string>();
  const participants = new Map<string, Student>();
  const contexts = new Map<string, { identifier: string; studentId: string; title: string }>();
  function remember(student: Student): Participant {
    if (!student || typeof student.id !== "string" || typeof student.student_number !== "string" || typeof student.full_name !== "string") throw new Error("Invalid student response");
    participants.set(student.student_number, student);
    return { id: student.id, identifier: student.student_number, fullName: student.full_name };
  }
  async function progress(identifier: string): Promise<Progress> {
    const student = participants.get(identifier);
    if (!student) throw new Error("Retrieve participant first");
    const data = await request<Progress>("/students/" + encodeURIComponent(student.id) + "/progress");
    if (data.student_id !== student.id || !Array.isArray(data.games) || typeof data.play_date !== "string" || !Number.isFinite(data.total_score)) throw new Error("Invalid progress response");
    if (data.games.some(game => !Number.isInteger(game.id) || game.id < 1 || game.id > 5 || typeof game.name !== "string" || game.max_score !== 100 || typeof game.is_active !== "boolean" || typeof game.eligible_to_start !== "boolean" || (game.attempt && (game.attempt.student_id !== student.id || game.attempt.game_id !== game.id || typeof game.attempt.id !== "string" || !["started","completed"].includes(game.attempt.status))))) throw new Error("Invalid game response");
    for (const game of data.games) {
      gameNames.set(game.id,game.name);
      if (game.attempt) contexts.set(game.attempt.id, { identifier, studentId: student.id, title: game.name });
    }
    return data;
  }
  function active(attempt: Attempt, identifier: string, title: string): GameAttempt {
    contexts.set(attempt.id, { identifier, studentId: attempt.student_id, title });
    return { id: attempt.id, participantIdentifier: identifier, gameId: String(attempt.game_id), gameTitle: title, day: attempt.play_date, section: null, status: "active" };
  }
  function saved(attempt: Attempt): SavedResult {
    const context = contexts.get(attempt.id);
    if (!context || attempt.student_id !== context.studentId || attempt.status !== "completed" || !validScore(attempt.score)) throw new Error("Unconfirmed result");
    return { attemptId: attempt.id, participantIdentifier: context.identifier, gameId: String(attempt.game_id), gameTitle: context.title, day: attempt.play_date, score: attempt.score };
  }
  const access: AccessService = { async verify(code) {
    try {
      const data = await request<{access_token:string; expires_in:number; token_type:string}>("/access/verify",{access_code:code},false);
      if (typeof data.access_token !== "string" || !data.access_token || data.token_type !== "Bearer" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Invalid session response");
      platformSession.accept(data.access_token,data.expires_in);
      return {status:"verified"};
    } catch(error) {
      if(error instanceof ApiError && ["invalid_access_code","invalid_input"].includes(error.code)) return {status:"rejected",message:"رمز الوصول غير صحيح. راجعه وحاول مجددًا."};
      throw error;
    }
  }};
  const participant: ParticipantService = {
    async register(input) {
      try { return {status:"success",participant:remember((await request<{student:Student}>("/students/register",{full_name:input.fullName,student_number:input.identifier})).student)}; }
      catch(error) {
        if(error instanceof ApiError && error.code === "student_number_exists") return {status:"duplicate",message:"هذا الرقم مسجّل بالفعل. استخدم مشارك سابق لاسترجاع بياناته."};
        if(error instanceof ApiError && error.code === "invalid_input") return {status:"invalid",message:"راجع الاسم والرقم التعريفي."};
        throw error;
      }
    },
    async find(identifier) {
      try { return {status:"success",participant:remember((await request<{student:Student}>("/students/login",{student_number:identifier})).student)}; }
      catch(error) {
        if(error instanceof ApiError && error.code === "student_not_found") return {status:"not-found",message:"لم نعثر على مشارك بهذا الرقم."};
        throw error;
      }
    },
  };
  const eligibility: EligibilityService = { async load(identifier) {
    const data = await progress(identifier);
    const games = data.games.map(game => ({id:String(game.id),title:game.name,maxScore:game.max_score,eligible:game.eligible_to_start,
      reason:game.attempt ? (game.attempt.status === "started" ? "توجد محاولة غير مكتملة لهذه اللعبة." : "سبق إكمال هذه اللعبة.") : data.daily_slot_consumed ? "استُهلكت فرصة المشاركة اليوم." : !game.is_active ? "اللعبة غير نشطة." : "متاحة وفق الخدمة."}));
    return {participantIdentifier:identifier,day:data.play_date,section:null,status:games.some(game=>game.eligible)?"eligible":"blocked",
      message:data.daily_slot_consumed?"استُهلكت فرصة اليوم، حتى لو لم تكتمل المحاولة.":games.some(game=>game.eligible)?"اختر لعبة متاحة وفق حالة الخدمة.":"لا توجد ألعاب متاحة حاليًا.",
      games,results:data.games.filter(game=>game.attempt?.status==="completed").map(game=>{const result=saved(game.attempt!);return {gameId:result.gameId,gameTitle:result.gameTitle,day:result.day,score:result.score};}),totalScore:data.total_score};
  }};
  const attempts: AttemptService = {
    async start(input) {
      const student = participants.get(input.participantIdentifier);
      if(!student) throw new Error("Retrieve participant first");
      try {
        const data=await request<{attempt:Attempt}>("/attempts/start",{student_id:student.id,game_id:Number(input.gameId)});
        if(data.attempt?.student_id!==student.id || data.attempt.game_id!==Number(input.gameId) || data.attempt.status!=="started" || typeof data.attempt.id!=="string") throw new Error("Unconfirmed start");
        return {status:"started",attempt:active(data.attempt,input.participantIdentifier,gameNames.get(Number(input.gameId)) ?? "اللعبة " + input.gameId)};
      } catch(error) {
        if(error instanceof ApiError && [400,404,409].includes(error.status)) return {status:"rejected",message:"لم تعتمد الخدمة بدء المحاولة. حدّث حالة المشارك للتحقق من الأهلية والمحاولات."};
        throw error;
      }
    },
    async inspect(identifier) { return (await this.listActive!(identifier))[0] ?? null; },
    async listActive(identifier) {
      const data=await progress(identifier);
      return data.games.filter(game=>game.attempt?.status==="started").map(game=>active(game.attempt!,identifier,game.name));
    },
  };
  const results: ResultService = {
    async inspect(attemptId) {
      const context=contexts.get(attemptId);
      if(!context) throw new Error("Unknown attempt context");
      const data=await progress(context.identifier);
      const attempt=data.games.find(game=>game.attempt?.id===attemptId)?.attempt;
      if(!attempt) throw new Error("Attempt missing from progress");
      return attempt.status==="completed"?saved(attempt):null;
    },
    async save(input) {
      if(!validScore(input.score)) return {status:"rejected",message:"يجب أن تكون النتيجة عددًا صحيحًا من 0 إلى 100."};
      if(!contexts.has(input.attemptId)) throw new Error("Unknown attempt context");
      // Read before writing, including retry after a lost response. Never rewrite a confirmed score.
      const previous=await this.inspect(input.attemptId);
      if(previous) return {status:"saved",result:previous};
      try {
        const data=await request<{attempt:Attempt;score_saved:boolean}>("/attempts/finish",{attempt_id:input.attemptId,score:input.score});
        if(data.score_saved!==true || data.attempt?.id!==input.attemptId) throw new Error("Unconfirmed save");
        return {status:"saved",result:saved(data.attempt)};
      } catch(error) {
        if(error instanceof ApiError && error.code==="attempt_already_completed") {
          const result=await this.inspect(input.attemptId);
          if(result) return {status:"saved",result};
          throw new Error("Result unresolved");
        }
        if(error instanceof ApiError && [400,404,409].includes(error.status)) return {status:"rejected",message:"لم تعتمد الخدمة النتيجة. تحقق من حالة الحفظ."};
        throw error;
      }
    },
  };
  const leaderboard: LeaderboardService = {async load() {
    const data=await request<{leaderboard:{full_name:string;total_score:number;games_completed:number}[]}>("/leaderboard");
    if(!Array.isArray(data.leaderboard) || data.leaderboard.length>3 || data.leaderboard.some(row=>typeof row.full_name!=="string" || !Number.isFinite(row.total_score) || !Number.isInteger(row.games_completed))) throw new Error("Invalid leaderboard response");
    return {entries:data.leaderboard.map((row,index)=>({rank:index+1,displayName:row.full_name,totalScore:row.total_score,gamesCompleted:row.games_completed})),updatedAt:new Date().toISOString()};
  }};
  return {access,participant,eligibility,attempts,results,leaderboard,clear:()=>{participants.clear();contexts.clear();gameNames.clear();platformSession.clear();}};
}
