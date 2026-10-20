/** Which イベント the create/edit sheet shows. eventId null + open = creating a new one. */
class EventSheet {
  open = $state(false);
  eventId = $state<string | null>(null);

  edit(id: string) {
    this.eventId = id;
    this.open = true;
  }
  create() {
    this.eventId = null;
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

export const eventSheet = new EventSheet();
