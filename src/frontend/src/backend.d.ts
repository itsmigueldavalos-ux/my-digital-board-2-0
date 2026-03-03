import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export type ShiftCoHost = string;
export interface UniversityBoardCard {
    id: CardId;
    col: Col;
    title: Title;
    createdAt: CreatedAt;
    createdBy: CreatedBy;
    term: Term;
    week: string;
    dueDate: string;
    course: string;
    assignmentTitle: string;
}
export type ShiftPattern = string;
export type Col = string;
export type Term = string;
export type Title = string;
export type CreatedBy = string;
export type CreatedAt = string;
export interface StaffingBoardCard {
    id: CardId;
    col: Col;
    status: Status;
    shiftCoHost: ShiftCoHost;
    createdAt: CreatedAt;
    createdBy: CreatedBy;
    personName: PersonName;
    login: Login;
    shiftPattern: ShiftPattern;
}
export type Status = string;
export type PersonName = string;
export type Login = string;
export type CardId = Uint8Array;
export interface backendInterface {
    getAllStaffingCards(): Promise<Array<StaffingBoardCard>>;
    getAllUniversityCards(): Promise<Array<UniversityBoardCard>>;
    getLastUpdated(): Promise<string>;
    saveAllStaffingCards(cards: Array<StaffingBoardCard>): Promise<void>;
    saveAllUniversityCards(cards: Array<UniversityBoardCard>): Promise<void>;
    setLastUpdated(timestamp: string): Promise<void>;
}
