const { h, Component } = require("preact");

// 🦹🏻‍ Bundle Bloat Protector
import Dialog from "preact-material-components/Dialog";

const { BoardSize, EntryMethod } = require("../../modules/multiplayer/gomoku");

const ALLOWED_ENTRY_METHODS = [
  EntryMethod.CREATE_PRIVATE,
];

const isTurnedOn = (entryMethod) => {
  let entryOk =
    entryMethod !== undefined && ALLOWED_ENTRY_METHODS.includes(entryMethod);
  return entryOk;
};

class BoardSizeModal extends Component {
  constructor() {
    super();
    this.state = { showDialog: false, turnedOnOnce: false };
  }

  render({ id = "board-size-modal", data, chooseBoardSize }) {
    if (undefined == data) {
      return h("div", { id });
    }

    let { entryMethod } = data;

    let { showDialog, turnedOnOnce } = this.state;

    let turnOn = isTurnedOn(entryMethod);

    let hide = !((turnOn && !turnedOnOnce) || showDialog);

    if (hide) {
      return h("div", { id });
    }

    return h(
      Dialog,
      {
        id,
        isOpen: true,
      },
      h(Dialog.Header, null, "Board Size"),
      h(Dialog.Body, null, "Choose the dimensions of the board."),
      h(
        Dialog.Footer,
        null,
        h(
          Dialog.FooterButton,
          {
            accept: true,
            onClick: () => {
              this.setState({ showDialog: false, turnedOnOnce: true });
              chooseBoardSize(BoardSize.NINE);
            },
          },
          "9x9"
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
              this.setState({ showDialog: false, turnedOnOnce: true });
              chooseBoardSize(BoardSize.THIRTEEN);
            },
          },
          "13x13"
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
              this.setState({ showDialog: false, turnedOnOnce: true });
              chooseBoardSize(BoardSize.NINETEEN);
            },
          },
          "19x19"
        )
      )
    );
  }
}

export default BoardSizeModal;
