const { h, Component } = require("preact");

// 🦹🏻‍ Bundle Bloat Protector
import Dialog from "preact-material-components/Dialog";

const {
  BoardSize,
  EntryMethod,
  IdleStatus,
} = require("../../modules/multiplayer/gomoku");

const FRONT_MATTER_TEXT =
  "This Gomoku UI implementation is derived in part from @SabakiHQ/Sabaki's great work, check 'em out!";

class WelcomeModal extends Component {
  constructor() {
    super();
    this.state = { showDialog: true };
  }

  render({
    id = "welcome-modal",
    joinPrivateGame = false,
    idleStatus,
    update,
    appEvents,
  }) {
    let empty = h("div", { id });
    let frontMatter = h(
      "div",
      { id: "welcome-front-matter" },
      FRONT_MATTER_TEXT
    );

    if (idleStatus && idleStatus !== IdleStatus.ONLINE) {
      return empty;
    }

    if (joinPrivateGame && this.state.showDialog) {
      return h(
        Dialog,
        {
          id,
          isOpen: true,
        },
        h(Dialog.Header, null, "Join Game"),
        h(
          Dialog.Body,
          null,
          "Welcome! You're joining a game created by your friend."
        ),
        h(
          Dialog.Footer,
          null,
          h(
            Dialog.FooterButton,
            {
              accept: true,
              onClick: () => {
                this.setState({ showDialog: false });
                update(EntryMethod.JOIN_PRIVATE);
              },
            },
            "OK"
          )
        )
      );
    }

    return this.state.showDialog
      ? h(
          Dialog,
          {
            id,
            isOpen: true,
          },
          h(Dialog.Header, null, "Gomoku🔹Five in a Row"),
          h(Dialog.Body, null, frontMatter),
          h(
            Dialog.Footer,
            null,
            h(
              Dialog.FooterButton,
              {
                cancel: true,
                onClick: () => {
                  this.setState({ showDialog: false });
                  update(EntryMethod.CREATE_PRIVATE);
                },
              },
              "Multiplayer (Share URL)"
            )
          ),
          h(
            Dialog.Footer,
            null,
            h(
              Dialog.FooterButton,
              {
                cancel: true,
                onClick: () => {
                  this.setState({ showDialog: false });
                  update(EntryMethod.FIND_PUBLIC);
                  let boardSize = BoardSize.NINETEEN;
                  appEvents.emit("choose-board-size", boardSize);
                },
              },
              "Multiplayer (Wait for 19x19)"
            )
          )
        )
      : empty;
  }
}

export default WelcomeModal;
