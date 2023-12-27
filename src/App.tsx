import React from "react";
import toast, { Toaster } from 'react-hot-toast';
import io from "socket.io-client";
import "./app.scss";
import "./main.scss";
import "./dina.scss";
import "./assets/css/CssMain.css"
import * as recordingUtils from "./js/recordingUtils.js";
import * as ui from "./js/ui.js";
import * as main from "./js/main.js";
import * as store from "./js/store.js";
import * as wss from "./js/wss.js";
import * as webRTCHandler from "./js/webRTCHandler.js";
import * as constants from "./js/constants.js";


require("webrtc-adapter"); // suport for diferent browsers

export interface ISuperHero {
  name: string;
  avatar: string;
  isTaken: boolean;
  inCall: boolean;
}

enum Status {
  calling,
  icomming,
  default,
  inCalling,
}

class App extends React.Component<
  {},
  {
    heroes: any | null;
    me: ISuperHero | null;
    him: ISuperHero | null;
    status: Status;
  }
> {
  requestId: string | null = null;
  pc: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  localVideo: HTMLVideoElement | null = null;
  remoteVideo: HTMLVideoElement | null = null;
  incommingOffer: RTCSessionDescription = null;
  socket: SocketIOClient.Socket | null = null;

  state = {
    heroes: null,
    me: null,
    him: null,
    status: Status.default,
  };


  

  
  createPeer() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: ["stun:stun.stunprotocol.org"],//nuestro servidor stun
	  //urls: ["stun:127.0.0.1:3478"],
        },
      ],
    });

    this.pc!.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        console.log("ice is null");
        return;
      }

      const { him }: { him: ISuperHero | null } = this.state;

      if (him != null) {
        console.log("enviando ice", event.candidate);
        this.socket!.emit("candidate", {
          him: him.name,
          candidate: event.candidate,
        });
      }
    });

 

    this.pc!.addEventListener("track", (event) => {
      // we received a media stream from the other person. as we're sure
      // we're sending only video streams, we can safely use the first
      // stream we got. by assigning it to srcObject, it'll be rendered
      // in our video tag, just like a normal video

      console.log("tenemos video", event);
      if (event.track.kind == "video") {
        this.remoteVideo!.srcObject = event.streams[0];
        //this.localVideo!.play();
      }
    });

    // our local stream can provide different tracks, e.g. audio and
    // video. even though we're just using the video track, we should
    // add all tracks to the webrtc connection
    for (const track of this.localStream.getTracks()) {
      this.pc!.addTrack(track, this.localStream);
    }
  }

  componentDidMount() {
    // get the audio and video
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: { width: 480, height: 640 } })
      .then((stream: MediaStream) => {
        this.localStream = stream;
        // play our local stream
        //this.localVideo!.srcObject = this.localStream;
        //this.localVideo!.play();

        this.connect();
      });
  }

  // connect to our socket.io server
  connect() {
    this.socket = io.connect("https://socket04.onrender.com"); //nuestro server local
    this.socket.on("on-connected", (heroes: any) => {
      console.log("heroes", heroes);
      this.setState({ heroes });
    	//this.socket = io.connect("https://socket.myrot.net"); //nuestro server local www.myrot.pa:5001
    	//this.socket.on("on-connected", (heroes: any) => {
     	// console.log("heroes", heroes);
      	 //this.setState({ heroes });
    });

    this.socket!.on("on-assigned", (heroName: string | null) => {
      const { heroes } = this.state;
      console.log("assigned", heroName);
      if (heroName) {
        this.setState({ me: heroes![heroName] as ISuperHero });
      }
    });

    this.socket!.on("on-taken", (heroName: string) => {
      this.setState((prevState) => {
        let { heroes } = prevState;
        let hero = heroes![heroName] as ISuperHero;
        hero.isTaken = true;
        heroes[heroName] = hero;

        return { heroes };
      });
    });

    


    this.socket!.on("on-disconnected", (heroName: string) => {
      this.pc = null;
      this.setState((prevState) => {
        let { heroes } = prevState;
        let hero = heroes![heroName] as ISuperHero;
        hero.isTaken = false;
        heroes[heroName] = hero;

        return { heroes };
      });
    });

    // incoming call
    this.socket!.on(
      "on-request",
      async ({
        superHeroName,
        requestId,
        offer,
      }: {
        superHeroName: string;
        requestId: string;
        offer: any | null;
      }) => {
        const { heroes } = this.state;
        this.requestId = requestId;
        this.incommingOffer = offer;
        this.setState({
          him: heroes![superHeroName] as ISuperHero,
          status: Status.icomming,
        });
      }
    );

    // response to our call request
    this.socket!.on("on-response", async (answer: any | null) => {
      if (answer) {
        // if the other user accepted our call
        await this.pc!.setRemoteDescription(answer);
        const { heroes } = this.state;
        this.setState({
          status: Status.inCalling,
        });
      } else {
        this.requestId = null;
        this.pc = null;
        this.setState({
          status: Status.default,
        });
      }
    });

    this.socket!.on("on-candidate", async (candiate: RTCIceCandidateInit) => {
      console.log("on-candidate", candiate);

      if (this.pc != null && this.state.him) {
        await this.pc!.addIceCandidate(candiate);
      }
    });

    this.socket!.on("on-finish-call", () => {
      this.requestId = null;
      this.pc = null;
      this.setState({
        him: null,
        status: Status.default,
      });
    });

    this.socket!.on("on-cancel-request", () => {
      this.incommingOffer = null;
      this.pc = null;
      this.setState({ him: null, status: Status.default });
    });
  }

  notify = () => toast('Here is your toast.');

  callTo = async (superHeroName: string) => {
    const { heroes } = this.state;
    this.createPeer();
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    console.log("llamando");
    this.socket!.emit("request", {
      superHeroName,
      offer,
    });
    this.setState({
      status: Status.calling,
      him: heroes![superHeroName] as ISuperHero,
    });
  };

  acceptOrDecline = async (accept: boolean) => {
    if (accept) {
      this.createPeer();
      await this.pc!.setRemoteDescription(this.incommingOffer);
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.socket!.emit("response", {
        requestId: this.requestId,
        answer,
      });
      this.setState({ status: Status.inCalling });
    } else {
      this.socket!.emit("response", {
        requestId: this.requestId,
        answer: null,
      });
      this.setState({ status: Status.default, him: null });
    }
  };

  finishCall = () => {
    this.socket!.emit("finish-call", null);
    this.setState({ status: Status.default, him: null });
    this.pc = null;
  };
  
  
  setearIndicadormic = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/mic', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/mic', true);
    xhttp.send();
  }

setearIndicadormic_off = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/mic_apagar', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/mic_apagar', true);
    xhttp.send();
  }

  setearIndicador1 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face1', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face1', true);
    xhttp.send();
  }

  setearIndicador2 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face2', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face2', true);
    xhttp.send();
  }

  setearIndicador3 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face3', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face3', true);
    xhttp.send();
  }

 
  MicButton_Remoto = () => {

    var x = document.getElementById("mic_on1");
    var y = document.getElementById("mic_off1");

    if (y.style.display == "none")
    {
      y.style.display = "block";
      x.style.display = "none";

      var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/mic_remoto0', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/mic_remoto0', true);
    xhttp.send();
    }
    else
    {
      y.style.display = "none";
      x.style.display = "block";

      var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/mic_remoto1', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/mic_remoto1', true);
    xhttp.send();



    }

  }


  MicButton_Turnall = () => {

    var x = document.getElementById("mic_on");
    var y = document.getElementById("mic_off");

    this.localStream.getAudioTracks().forEach(function(track) {
      

      if (track.enabled == false)
      {
        track.enabled = true;
        y.style.display = "none";
      x.style.display = "block";
      }
      else{
        track.enabled = false;

        y.style.display = "block";
      x.style.display = "none";

    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/mic_apagar', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/mic_apagar', true);
    xhttp.send();


    
    
    if (y.style.display == "none")
    {
      
    }
    else{
      
    }


      }

      console.log(track.enabled);

    });

  
  } 


  setearIndicador4 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face4', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face4', true);
    xhttp.send();
  }


 setearIndicador5 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face5', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face5', true);
    xhttp.send();
  }

  setearIndicador6 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face6', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face6', true);
    xhttp.send();
  }

  setearIndicador7 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face7', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face7', true);
    xhttp.send();
  }

  setearIndicador8 = ()  => {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        document.getElementById("demo").innerHTML =
        this.responseText;
      }
    };
    //xhttp.open("GET", 'https://event.myrot.net/face8', true);
    xhttp.open("GET", 'https://eventos04.onrender.com/face8', true);
    xhttp.send();
  }

  cambiaricono_mic = () => {
              
    var x = document.getElementById("mic_on");
    var y = document.getElementById("mic_off");
    
    if (y.style.display == "none")
    {
      y.style.display = "block";
      x.style.display = "none";
    }
    else{
      y.style.display = "none";
      x.style.display = "block";
    }

  }


  render() {
    const {
      heroes,
      me,
      him,
      status,
    }: {
      heroes: any;
      me: ISuperHero | null;
      him: ISuperHero | null;
      status: Status;
    } = this.state;
    return (
      <div>
        <video
          id="local-video"
          ref={(ref) => (this.localVideo = ref)}
          playsInline
          autoPlay
          muted
          className={status === Status.inCalling ? "d-block" : "d-none"}
          style={{ zIndex: 99 }}
        />

        <div className="center-flex">
          <video
            id="remote-video"
            ref={(ref) => (this.remoteVideo = ref)}
            autoPlay
            muted={false}
            playsInline
            className={status === Status.inCalling ? "d-block" : "d-none"}
            style={{ height: "100vh" }}
          />

          {heroes && status !== Status.inCalling && (
            <div id="connected-heroes" className="pa-right-20">
              <div>
                {Object.keys(heroes!)
                  .filter((key) => {
                    if (me == null) return true;
                    return me!.name !== key;
                  })
                  .map((key) => {
                    const hero = (heroes as any)[key];
                    return (
                     
<div className="Home_General">
<div
                        className="item-hero"
                        key={key}
                        style={{ opacity: hero.isTaken ? 1 : 0.3 }}
                      >


    

<div className="container">


  <div className="interior">


    <a  href="#open-modal">
                     <img className="avatar-cirle" src={hero.avatar}/></a>


  </div>
</div>


<div id="open-modal" className="modal-window">

  <div className="pfp-space">

    <a href="#" title="Close" className="modal-close">Close</a>
 
    <img className="avatar-cirle-card" src={hero.avatar} />

    <h1>{hero.name}</h1>
    
   
    <h2>Terapeuta</h2>

    
  <div className="profile-bio">
    
    <p>"Todos somos MyRoT"</p>
    
  </div>

  <div>

  <button
                          type="button"
                          className="btn bg-red"
                          onClick={() => this.callTo(hero.name)}
                        >
                          <i className="material-icons f-40">call</i>
                        </button>

                       

  </div>


    </div>


</div>






                      

                      

                        
                      </div>


</div>


                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {!me && (
          <div id="picker" className="d-flex ai-center jc-center t-center">
            <div>
              <h3 className="c-white f-20 uppercase">Seleccionar--Operador</h3>
              <div className="d-flex">
                {heroes &&
                  Object.keys(heroes!).map((key) => {
                    const hero = (heroes as any)[key];
                    return (
                      <div
                        className="pa-20"
                        key={key}
                        style={{ opacity: hero.isTaken ? 0.3 : 1 }}
                      >
                        <img
                          className="avatar pointer"
                          src={hero.avatar}
                          onClick={() => {
                            if (!hero.isTaken) {
                              this.socket!.emit("pick", hero.name);
                            }
                          }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {status === Status.icomming && (
          <div
            className="fixed left-0 right-0 bottom-0 top-0 bg  d-flex flex-column ai-center jc-center"
            style={{ zIndex: 99 }}
          >
            <div>
              <img className="avatar" src={him.avatar} />
            </div>
            <div className="ma-top-20">
              <button
                className="btn bg-green"
                type="button"
                onClick={() => this.acceptOrDecline(true)}
              >
                <i className="material-icons f-40">call</i>
              </button>
              <button
                className="ma-left-50 btn bg-red"
                type="button"
                onClick={() => this.acceptOrDecline(false)}
              >
                <i className="material-icons f-40">call_end</i>
              </button>
            </div>
          </div>
        )}

        {status === Status.calling && (
          <div
            className="fixed left-0 right-0 bottom-0 top-0 bg  d-flex flex-column ai-center jc-center"
            style={{ zIndex: 99 }}
          >
            <img className="avatar" src={him.avatar} />
     
            <button
              className="ma-top-30 btn bg-red"
              type="button"
              onClick={() => {
                this.socket!.emit("cancel-request");
                this.setState({ him: null, status: Status.default });
              }}
            >
              <i className="material-icons f-40">call_end</i>
            </button>
          </div>
        )}

        {status === Status.inCalling && (
  

 /*fixed left-0 right-0 bottom-0 d-flex-general ai-center jc-center*/
          
<div className="styling col-30">

          <button
            
            className="ma-left-20 btn-v2 bg-blue icon-video-position"
            type="button"
            onClick={this.MicButton_Turnall}
          >
            
            <i id="mic_on" className="material-icons f-40">mic</i>
            <i id="mic_off" className="material-icons f-40">mic_off</i>
           
          </button>


                  
            

         


          <button
            className="ma-left-20 btn-v2 bg-red icon-video-position"
            type="button"
            onClick={this.finishCall}
          >
            <i className="material-icons f-40">call_end</i>
          </button>
          
          <button
            className="ma-left-20 btns btn-1 btns-img-1"
            type="button"
            onClick={this.setearIndicador1}
            
          >

     <i className="mdi-emoticon-happy-outline"></i>

          </button>

        
          <button
            className="ma-left-20 btns btn-2 btns-img-2"
            type="button"
            onClick={this.setearIndicador2}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>


        

          <button
            className="ma-left-20 btns btn-3 btns-img-3"
            type="button"
            onClick={this.setearIndicador3}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>

   
          <button
            className="ma-left-20 btns btn-4 btns-img-4"
            type="button"
            onClick={this.setearIndicador4}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>

  

          <hr className="line-space"></hr>

          <button
            className="ma-left-20 btns btn-center btns-img-center"
            type="button"
            onClick={this.setearIndicadormic}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>


          <hr className="line-space"></hr>
          
          <button
            className="ma-left-20 btns btn-5 btns-img-5"
            type="button"
            onClick={this.setearIndicador5}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>

          <button
            className="ma-left-20 btns btn-6 btns-img-6"
            type="button"
            onClick={this.setearIndicador6}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>

        

          <button
            className="ma-left-20 btns btn-7 btns-img-7"
            type="button"
            onClick={this.setearIndicador7}
          >
            <i className="mdi-emoticon-happy-outline"></i>
          </button>

       

          <button
            
            className="ma-left-20 btns btn-8 btns-img-8"
            type="button"
            onClick={this.setearIndicador8}
          >
            <i className="mdi-emoticon-happy-outline"></i>

          </button>

  
</div>




        )}
      </div>



    );
  }
}

export default App;
