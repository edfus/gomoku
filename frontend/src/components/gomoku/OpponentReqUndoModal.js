const { h, Component } = require("preact");

// 🦹🏻‍ Bundle Bloat Protector
import Dialog from "preact-material-components/Dialog";

class OpponentReqUndoModal extends Component {
  constructor() {
    super();
    this.state = { showDialog: false, scoringMode: false };

    // From GTP.js
    sabaki.events.on("gomoku-request-for-undo", ({ showWait, reqId, player }) => {
      this.setState({ showDialog: showWait, reqId, player });
    });
  }

  render({ id = "opponent-req-undo-modal" }) {
    let { showDialog, answered, reqId, player } = this.state;

    let empty = h("div", { id });

    return showDialog
      ?
      answered ?
        h(
          Dialog,
          {
            id,
            isOpen: true,
          },
          h(Dialog.Body, null, "Syncing...")
        )
        : h(
          Dialog,
          {
            id,
            isOpen: true,
          },
          h(Dialog.Header, null, "Undo Request"),
          h(Dialog.Body, null, "Your opponent asked for an undo."),
          h(
            Dialog.Footer,
            {
              style: "justify-content: space-evenly;"
            },
            h(
              Dialog.FooterButton,
              {
                accept: true,
                onClick: () => {
                  this.setState({ answered: true });
                  sabaki.answerUndoReq(true, reqId, player);
                },
                style: "transform: scale(1.7);"
              },
              "Accept"
            ),
            h(
              Dialog.FooterButton,
              {
                accept: false,
                onClick: () => {
                  this.setState({ answered: true });
                  sabaki.answerUndoReq(false, reqId, player);
                },
                style: "transform: scale(1.7);"
              },
              "Decline"
            )
          )
        )
      : empty;
  }
}

export default OpponentReqUndoModal;
