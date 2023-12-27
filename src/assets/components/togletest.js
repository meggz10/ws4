import React from "react";
import ReactDOM from 'react-dom';

class Toggle extends React.Component {
    state = {
      show: true,
    }
  
      toggle = () => this.setState((currentState) => ({show: !currentState.show}));
  
    render() {
      return (
        <div>
                <button onClick={this.toggle}>toggle: {this.state.show ? 'show' : 'hide'}</button>    
          {this.state.show && <div>Hi there</div>}
            </div>
       );
    }
  }
  
  /*
  ReactDOM.render(
    <Toggle />,
    document.getElementById('root')
  );

  export default Toggle;
  */

  ReactDOM.render(<Toggle />, document.getElementById('app'));