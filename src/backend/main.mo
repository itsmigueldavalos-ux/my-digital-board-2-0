import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import List "mo:core/List";
import Order "mo:core/Order";


// apply migration in with clause

actor {
  type CardId = Blob;
  type PersonName = Text;
  type Login = Text;
  type ShiftCoHost = Text;
  type ShiftPattern = Text;
  type Col = Text;
  type CreatedBy = Text;
  type CreatedAt = Text;
  type Title = Text;
  type Term = Text;
  type Status = Text;
  type AssignmentTitle = Text;
  type Course = Text;
  type DueDate = Text;
  type Week = Text;

  type StaffingBoardCard = {
    id : CardId;
    personName : PersonName;
    login : Login;
    shiftCoHost : ShiftCoHost;
    shiftPattern : ShiftPattern;
    col : Col;
    createdBy : CreatedBy;
    createdAt : CreatedAt;
    status : Status;
  };

  type UniversityBoardCard = {
    id : CardId;
    title : Title;
    term : Term;
    col : Col;
    createdBy : CreatedBy;
    createdAt : CreatedAt;
    assignmentTitle : Text;
    course : Text;
    dueDate : Text;
    week : Text;
  };

  module StaffingBoardCard {
    public func compare(a : StaffingBoardCard, b : StaffingBoardCard) : Order.Order {
      Text.compare(a.personName, b.personName);
    };
  };

  let staffingCards = List.empty<StaffingBoardCard>();

  module UniversityBoardCard {
    public func compare(a : UniversityBoardCard, b : UniversityBoardCard) : Order.Order {
      Text.compare(a.title, b.title);
    };
  };

  let universityCards = List.empty<UniversityBoardCard>();

  var lastUpdated : Text = "";

  public shared ({ caller }) func saveAllStaffingCards(cards : [StaffingBoardCard]) : async () {
    staffingCards.clear();
    staffingCards.addAll(cards.values());
  };

  public query ({ caller }) func getAllStaffingCards() : async [StaffingBoardCard] {
    staffingCards.toArray().sort();
  };

  public shared ({ caller }) func saveAllUniversityCards(cards : [UniversityBoardCard]) : async () {
    universityCards.clear();
    universityCards.addAll(cards.values());
  };

  public query ({ caller }) func getAllUniversityCards() : async [UniversityBoardCard] {
    universityCards.toArray().sort();
  };

  public shared ({ caller }) func setLastUpdated(timestamp : Text) : async () {
    lastUpdated := timestamp;
  };

  public query ({ caller }) func getLastUpdated() : async Text {
    lastUpdated;
  };
};
