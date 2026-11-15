
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
type Progress = { student_id: string; play_date: string; total_score: number; games_completed?: number; games: Game[] };
const integerInRange = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const validScore = (value: unknown): value is number => integerInRange(value, 0, 100);
const validGameId = (value: unknown): value is number => integerInRange(value, 1, 5);
export class BackendValidationError extends Error {
  constructor() {
    super("تعذّر اعتماد بيانات الخدمة: بيانات الألعاب أو النقاط أو هوية المحاولة غير متوافقة. أعد التحقق من الحالة.");
    this.name = "BackendValidationError";
  }
}
export function createBackendServices(base: string, transport: typeof fetch = fetch) {
  const request = createApiClient(base, transport);
  const gameNames = new Map<number,string>();
  const participants = new Map<string, Student>();
  const contexts = new Map<string, { identifier: string; studentId: string; gameId: number; title: string }>();
  function checkContext(attempt: Attempt, studentId: string, gameId: number) {
    const known = contexts.get(attempt.id);
    if (attempt.student_id !== studentId || attempt.game_id !== gameId ||
        (known && (known.studentId !== studentId || known.gameId !== gameId))) throw new BackendValidationError();
  }
  function remember(student: Student, requestedIdentifier: string): Participant {
    if (!student || typeof student.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student.id) ||
        typeof student.student_number !== "string" || !student.student_number || student.student_number !== requestedIdentifier ||
        typeof student.full_name !== "string" || !student.full_name.trim()) throw new BackendValidationError();
    participants.set(student.student_number, student);
    return { id: student.id, identifier: student.student_number, fullName: student.full_name };
  }
  async function progress(identifier: string): Promise<Progress> {
    const student = participants.get(identifier);
    if (!student) throw new Error("Retrieve participant first");
    const data = await request<Progress>("/students/" + encodeURIComponent(student.id) + "/progress");
    if (!data || data.student_id !== student.id || !Array.isArray(data.games) || data.games.length > 5 ||
        typeof data.play_date !== "string" || !integerInRange(data.total_score, 0, 500) ||
        (Object.hasOwn(data, "games_completed") && !integerInRange(data.games_completed, 0, 5))) throw new BackendValidationError();
    const gameIds = new Set<number>(), attemptIds = new Set<string>();
    // Validate the entire response before updating any remembered attempt identity.
    for (const game of data.games) {
      if (!game || !validGameId(game.id) || gameIds.has(game.id) || typeof game.name !== "string" ||
          game.max_score !== 100 || typeof game.is_active !== "boolean" || typeof game.eligible_to_start !== "boolean") throw new BackendValidationError();
      gameIds.add(game.id);
      if (game.attempt !== null) {
        const attempt = game.attempt;
        if (!attempt || typeof attempt.id !== "string" || !attempt.id || attemptIds.has(attempt.id) ||
            !["started", "completed"].includes(attempt.status) ||
            (attempt.status === "completed" ? !validScore(attempt.score) : attempt.score !== null)) throw new BackendValidationError();
        checkContext(attempt, student.id, game.id);
        attemptIds.add(attempt.id);
      }
    }
    for (const game of data.games) {
      gameNames.set(game.id,game.name);
      if (game.attempt) contexts.set(game.attempt.id, { identifier, studentId: student.id, gameId: game.id, title: game.name });
    }
    return data;
  }
  function active(attempt: Attempt, identifier: string, title: string): GameAttempt {
    checkContext(attempt, attempt.student_id, attempt.game_id);
    contexts.set(attempt.id, { identifier, studentId: attempt.student_id, gameId: attempt.game_id, title });
    return { id: attempt.id, participantIdentifier: identifier, gameId: String(attempt.game_id), gameTitle: title, day: attempt.play_date, section: null, status: "active" };
  }
  function saved(attempt: Attempt, expectedId: string): SavedResult {
    const context = contexts.get(expectedId);
    if (!attempt || attempt.id !== expectedId || !context || attempt.student_id !== context.studentId ||
        attempt.game_id !== context.gameId || attempt.status !== "completed" || !validScore(attempt.score)) throw new BackendValidationError();
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
      try { return {status:"success",participant:remember((await request<{student:Student}>("/students/register",{full_name:input.fullName,student_number:input.identifier})).student,input.identifier)}; }
      catch(error) {
        if(error instanceof ApiError && error.code === "student_number_exists") return {status:"duplicate",message:"هذا الرقم مسجّل بالفعل. استخدم مشارك سابق لاسترجاع بياناته."};
        if(error instanceof ApiError && error.code === "invalid_input") return {status:"invalid",message:"راجع الاسم والرقم التعريفي."};
        throw error;
      }
    },
    async find(identifier) {
      try { return {status:"success",participant:remember((await request<{student:Student}>("/students/login",{student_number:identifier})).student,identifier)}; }
      catch(error) {
        if(error instanceof ApiError && error.code === "student_not_found") return {status:"not-found",message:"لم نعثر على مشارك بهذا الرقم."};
        throw error;
      }
    },
  };
  const eligibility: EligibilityService = { async load(identifier) {
    const data = await progress(identifier);
    const games = data.games.map(game => ({id:String(game.id),title:game.name,maxScore:game.max_score,eligible:game.eligible_to_start,
      reason:game.attempt ? (game.attempt.status === "started" ? "توجد محاولة غير مكتملة لهذه اللعبة." : "سبق إكمال هذه اللعبة.") : !game.is_active ? "اللعبة غير نشطة." : game.eligible_to_start ? "متاحة وفق الخدمة." : "غير متاحة وفق حالة الخدمة."}));
    return {participantIdentifier:identifier,day:data.play_date,section:null,status:games.some(game=>game.eligible)?"eligible":"blocked",
      message:games.some(game=>game.eligible)?"اختر لعبة متاحة وفق حالة الخدمة.":"لا توجد ألعاب متاحة حاليًا.",
      games,results:data.games.filter(game=>game.attempt?.status==="completed").map(game=>{const result=saved(game.attempt!,game.attempt!.id);return {gameId:result.gameId,gameTitle:result.gameTitle,day:result.day,score:result.score};}),totalScore:data.total_score};
  }};
  const attempts: AttemptService = {
    async start(input) {
      if (typeof input.gameId !== "string" || !["1", "2", "3", "4", "5"].includes(input.gameId)) return {status:"rejected",message:"معرّف اللعبة غير صالح. اختر لعبة معتمدة من 1 إلى 5."};
      const gameId = Number(input.gameId);
      const student = participants.get(input.participantIdentifier);
      if(!student) throw new Error("Retrieve participant first");
      try {
        const data=await request<{attempt:Attempt}>("/attempts/start",{student_id:student.id,game_id:gameId});
        if(data.attempt?.student_id!==student.id || data.attempt.game_id!==gameId || data.attempt.status!=="started" || typeof data.attempt.id!=="string" || !data.attempt.id) throw new BackendValidationError();
        return {status:"started",attempt:active(data.attempt,input.participantIdentifier,gameNames.get(gameId) ?? "اللعبة " + input.gameId)};
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
      if(!attempt) throw new BackendValidationError();
      checkContext(attempt, context.studentId, context.gameId);
      return attempt.status==="completed"?saved(attempt,attemptId):null;
    },
    async save(input) {
      if(!validScore(input.score)) return {status:"rejected",message:"يجب أن تكون النتيجة عددًا صحيحًا من 0 إلى 100."};
      if(!contexts.has(input.attemptId)) throw new Error("Unknown attempt context");
      // Read before writing, including retry after a lost response. Never rewrite a confirmed score.
      const previous=await this.inspect(input.attemptId);
      if(previous) return {status:"saved",result:previous};
      try {
        const data=await request<{attempt:Attempt;score_saved:boolean}>("/attempts/finish",{attempt_id:input.attemptId,score:input.score});
        if(data.score_saved!==true || data.attempt?.id!==input.attemptId) throw new BackendValidationError();
        return {status:"saved",result:saved(data.attempt,input.attemptId)};
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
